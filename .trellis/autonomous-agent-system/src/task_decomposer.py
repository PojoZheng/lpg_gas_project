#!/usr/bin/env python3
"""
Task Decomposer - 任务拆解器

将大型任务自动拆解为 <60k tokens 的可执行步骤。

Usage:
    python task_decomposer.py --prd path/to/prd.md --output steps.json
"""

import json
import re
import hashlib
from dataclasses import dataclass, field, asdict
from typing import List, Dict, Optional, Set, Tuple
from pathlib import Path
from collections import defaultdict
import argparse


# ============ 常量配置 ============

TOKEN_BUDGET = {
    "total_limit": 60000,
    "context_reserve": 0.20,
    "output_reserve": 0.15,
    "safety_buffer": 0.10,
    "usable": 0.55,  # 实际可用约 33k
}

# 各操作类型的 Token 消耗估算 (每行代码)
TOKEN_RATES = {
    "read": 2,      # 读取一行代码
    "write": 4,     # 写入一行代码
    "test": 3,      # 测试代码
    "doc": 2,       # 文档
    "context": 3,   # 上下文传递
}

# 文件类型权重
FILE_TYPE_WEIGHTS = {
    ".ts": 1.0,
    ".tsx": 1.2,
    ".js": 0.9,
    ".jsx": 1.1,
    ".py": 1.0,
    ".java": 1.3,
    ".go": 0.9,
    ".md": 0.5,
    ".json": 0.3,
    ".yaml": 0.4,
    ".yml": 0.4,
}


# ============ 数据模型 ============

@dataclass
class TokenBudget:
    """Token 预算配置"""
    estimated: int
    limit: int = 60000
    context_reserve: int = field(default_factory=lambda: int(60000 * 0.2))
    
    def to_dict(self) -> Dict:
        return asdict(self)


@dataclass
class StepInputs:
    """步骤输入定义"""
    files: List[str] = field(default_factory=list)
    context_from: List[str] = field(default_factory=list)
    spec_refs: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict:
        return asdict(self)


@dataclass
class StepOutputs:
    """步骤输出定义"""
    files: List[str] = field(default_factory=list)
    tests: List[str] = field(default_factory=list)
    docs: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict:
        return asdict(self)


@dataclass
class StepDependencies:
    """步骤依赖关系"""
    steps: List[str] = field(default_factory=list)
    optional: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict:
        return asdict(self)


@dataclass
class StepAgent:
    """执行 Agent 配置"""
    type: str = "dev-a"  # dev-a, dev-b, dev-c, integrator
    worktree: Optional[str] = None
    
    def to_dict(self) -> Dict:
        return asdict(self)


@dataclass
class Step:
    """任务步骤定义"""
    # 基本信息
    id: str
    task_id: str
    sequence: int
    
    # 内容
    title: str
    description: str
    acceptance: List[str] = field(default_factory=list)
    
    # Token 预算
    token_budget: TokenBudget = field(default_factory=lambda: TokenBudget(estimated=0))
    
    # 输入/输出
    inputs: StepInputs = field(default_factory=StepInputs)
    outputs: StepOutputs = field(default_factory=StepOutputs)
    
    # 依赖
    dependencies: StepDependencies = field(default_factory=StepDependencies)
    
    # Agent
    agent: StepAgent = field(default_factory=StepAgent)
    
    # 状态 (运行时)
    status: str = "pending"
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    
    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "taskId": self.task_id,
            "sequence": self.sequence,
            "title": self.title,
            "description": self.description,
            "acceptance": self.acceptance,
            "tokenBudget": self.token_budget.to_dict(),
            "inputs": self.inputs.to_dict(),
            "outputs": self.outputs.to_dict(),
            "dependencies": self.dependencies.to_dict(),
            "agent": self.agent.to_dict(),
            "status": self.status,
            "startedAt": self.started_at,
            "completedAt": self.completed_at,
        }


# ============ Token 估算器 ============

class TokenEstimator:
    """Token 消耗估算器"""
    
    def __init__(self):
        self.rates = TOKEN_RATES
        self.file_weights = FILE_TYPE_WEIGHTS
    
    def estimate_file_tokens(self, file_path: str, lines_of_code: int, operation: str = "read") -> int:
        """估算单个文件的 Token 消耗"""
        ext = Path(file_path).suffix.lower()
        weight = self.file_weights.get(ext, 1.0)
        rate = self.rates.get(operation, 2)
        
        return int(lines_of_code * rate * weight)
    
    def estimate_step_tokens(
        self,
        input_files: List[Tuple[str, int]],  # (path, lines)
        output_files: List[Tuple[str, int]],
        test_files: List[Tuple[str, int]] = None,
        context_lines: int = 500
    ) -> int:
        """估算整个步骤的 Token 消耗"""
        total = 0
        
        # 输入文件读取
        for path, lines in input_files:
            total += self.estimate_file_tokens(path, lines, "read")
        
        # 输出文件写入
        for path, lines in output_files:
            total += self.estimate_file_tokens(path, lines, "write")
        
        # 测试文件
        if test_files:
            for path, lines in test_files:
                total += self.estimate_file_tokens(path, lines, "test")
        
        # 上下文传递
        total += context_lines * self.rates["context"]
        
        # 固定开销 (指令、框架等)
        total += 3000
        
        return total
    
    def is_within_budget(self, estimated_tokens: int) -> bool:
        """检查是否在预算内"""
        usable_budget = int(TOKEN_BUDGET["total_limit"] * TOKEN_BUDGET["usable"])
        return estimated_tokens <= usable_budget


# ============ 文件分析器 ============

class FileAnalyzer:
    """代码文件分析器"""
    
    def __init__(self, project_root: str):
        self.project_root = Path(project_root)
    
    def analyze_file(self, file_path: str) -> Dict:
        """分析单个文件"""
        full_path = self.project_root / file_path
        
        if not full_path.exists():
            return {
                "path": file_path,
                "exists": False,
                "lines": 0,
                "type": "unknown"
            }
        
        try:
            with open(full_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
                lines = content.count('\n') + 1
            
            ext = full_path.suffix.lower()
            
            # 简单检测文件类型
            file_type = "code"
            if ext in ['.md', '.rst', '.txt']:
                file_type = "doc"
            elif ext in ['.json', '.yaml', '.yml']:
                file_type = "config"
            elif 'test' in file_path.lower() or 'spec' in file_path.lower():
                file_type = "test"
            
            return {
                "path": file_path,
                "exists": True,
                "lines": lines,
                "type": file_type,
                "extension": ext,
                "size": len(content)
            }
        except Exception as e:
            return {
                "path": file_path,
                "exists": True,
                "lines": 0,
                "type": "unknown",
                "error": str(e)
            }
    
    def group_by_module(self, files: List[str]) -> Dict[str, List[str]]:
        """按模块/目录分组文件"""
        groups = defaultdict(list)
        
        for file in files:
            path = Path(file)
            # 使用第一级目录作为模块名
            module = path.parts[0] if path.parts else "root"
            groups[module].append(file)
        
        return dict(groups)
    
    def find_dependencies(self, file_path: str) -> List[str]:
        """简单查找文件依赖 (import/require)"""
        full_path = self.project_root / file_path
        
        if not full_path.exists():
            return []
        
        dependencies = []
        
        try:
            with open(full_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            
            # 简单正则匹配 import/require
            import_patterns = [
                r'import\s+.*?\s+from\s+[\'"](.+?)[\'"]',  # ES6 import
                r'require\([\'"](.+?)[\'"]\)',              # CommonJS require
                r'import\s+[\'"](.+?)[\'"]',               # ES6 side-effect import
            ]
            
            for pattern in import_patterns:
                matches = re.findall(pattern, content)
                dependencies.extend(matches)
        except Exception:
            pass
        
        return dependencies


# ============ 任务拆解器 ============

class TaskDecomposer:
    """任务拆解器主类"""
    
    def __init__(self, project_root: str, task_id: str):
        self.project_root = project_root
        self.task_id = task_id
        self.estimator = TokenEstimator()
        self.analyzer = FileAnalyzer(project_root)
        self.steps: List[Step] = []
    
    def decompose(
        self,
        prd_content: str,
        acceptance_criteria: List[str],
        related_files: List[str] = None
    ) -> List[Step]:
        """
        主拆解流程
        
        Args:
            prd_content: PRD 文档内容
            acceptance_criteria: 验收标准列表
            related_files: 相关文件列表
            
        Returns:
            有序的 Step 列表
        """
        # 1. 解析 PRD，提取功能点
        functional_points = self._extract_functional_points(prd_content)
        
        # 2. 分析相关文件
        file_analyses = {}
        if related_files:
            for f in related_files:
                file_analyses[f] = self.analyzer.analyze_file(f)
        
        # 3. 按模块分组
        module_groups = self.analyzer.group_by_module(related_files or [])
        
        # 4. 生成初始步骤
        raw_steps = self._generate_raw_steps(
            functional_points,
            acceptance_criteria,
            file_analyses
        )
        
        # 5. Token 估算与优化
        optimized_steps = self._optimize_steps(raw_steps, file_analyses)
        
        # 6. 依赖排序
        sorted_steps = self._topological_sort(optimized_steps)
        
        # 7. 分配序列号
        for i, step in enumerate(sorted_steps, 1):
            step.sequence = i
            step.id = f"step-{self.task_id}-{i:03d}"
        
        self.steps = sorted_steps
        return sorted_steps
    
    def _extract_functional_points(self, prd_content: str) -> List[Dict]:
        """从 PRD 提取功能点 (简化版)"""
        points = []
        
        # 简单解析: 查找标题和列表项
        lines = prd_content.split('\n')
        current_section = None
        
        for line in lines:
            line = line.strip()
            
            # 检测标题 (## 或 ###)
            if line.startswith('## ') or line.startswith('### '):
                current_section = line.lstrip('#').strip()
            
            # 检测列表项 (以 - 或数字开头)
            elif line.startswith('- ') or re.match(r'^\d+\.', line):
                point_text = line.lstrip('- ').strip()
                if len(point_text) > 10:  # 过滤短文本
                    points.append({
                        "section": current_section,
                        "description": point_text,
                        "type": "feature"
                    })
        
        # 如果没有解析到，使用默认功能点
        if not points:
            points = [{
                "section": "implementation",
                "description": "实现 PRD 中描述的功能",
                "type": "feature"
            }]
        
        return points
    
    def _generate_raw_steps(
        self,
        functional_points: List[Dict],
        acceptance_criteria: List[str],
        file_analyses: Dict
    ) -> List[Step]:
        """生成初始步骤列表"""
        steps = []
        
        # 步骤类型模板
        step_templates = [
            {
                "type": "interface",
                "title": "定义接口契约",
                "description": "创建/更新 API 类型定义和接口契约",
                "acceptance": [
                    "TypeScript 类型定义完整",
                    "API 契约文档已更新"
                ]
            },
            {
                "type": "data",
                "title": "定义数据模型",
                "description": "创建/更新数据模型和数据库 Schema",
                "acceptance": [
                    "实体定义完整",
                    "迁移脚本已创建 (如需要)"
                ]
            },
            {
                "type": "core",
                "title": "实现核心业务逻辑",
                "description": "实现主要业务功能",
                "acceptance": []
            },
            {
                "type": "ui",
                "title": "实现 UI 组件",
                "description": "创建/更新用户界面组件",
                "acceptance": [
                    "组件可正常渲染",
                    "交互功能完整"
                ]
            },
            {
                "type": "integration",
                "title": "集成与联调",
                "description": "整合各模块，确保端到端功能正常",
                "acceptance": [
                    "端到端流程可跑通",
                    "数据流正确"
                ]
            },
            {
                "type": "test",
                "title": "编写测试",
                "description": "编写单元测试和集成测试",
                "acceptance": [
                    "单元测试覆盖率 > 80%",
                    "集成测试通过"
                ]
            },
            {
                "type": "doc",
                "title": "更新文档",
                "description": "更新相关文档和注释",
                "acceptance": [
                    "API 文档已更新",
                    "CHANGELOG 已更新"
                ]
            }
        ]
        
        seq = 1
        for template in step_templates:
            # 根据功能点和文件分析生成具体步骤
            step = Step(
                id=f"step-{self.task_id}-{seq:03d}",
                task_id=self.task_id,
                sequence=seq,
                title=template["title"],
                description=template["description"],
                acceptance=template["acceptance"],
                token_budget=TokenBudget(estimated=30000)
            )
            steps.append(step)
            seq += 1
        
        # 根据验收标准添加额外步骤
        for i, criteria in enumerate(acceptance_criteria):
            step = Step(
                id=f"step-{self.task_id}-{seq:03d}",
                task_id=self.task_id,
                sequence=seq,
                title=f"验收: {criteria[:30]}...",
                description=f"确保满足验收标准: {criteria}",
                acceptance=[criteria],
                token_budget=TokenBudget(estimated=15000)
            )
            steps.append(step)
            seq += 1
        
        return steps
    
    def _optimize_steps(self, steps: List[Step], file_analyses: Dict) -> List[Step]:
        """优化步骤: 合并小步骤, 拆分大步骤"""
        optimized = []
        
        for step in steps:
            # 估算当前步骤 Token
            estimated = self._estimate_step_tokens(step, file_analyses)
            step.token_budget.estimated = estimated
            
            if estimated > 50000:
                # 步骤太大, 需要拆分
                sub_steps = self._split_step(step, file_analyses)
                optimized.extend(sub_steps)
            elif estimated < 10000 and optimized:
                # 步骤太小, 尝试与前一个合并
                prev_step = optimized[-1]
                combined_estimate = prev_step.token_budget.estimated + estimated
                
                if combined_estimate < 50000:
                    # 可以合并
                    merged_step = self._merge_steps(prev_step, step)
                    optimized[-1] = merged_step
                else:
                    optimized.append(step)
            else:
                optimized.append(step)
        
        return optimized
    
    def _estimate_step_tokens(self, step: Step, file_analyses: Dict) -> int:
        """估算步骤 Token 消耗"""
        input_files = []
        for f in step.inputs.files:
            analysis = file_analyses.get(f, {})
            lines = analysis.get("lines", 100)
            input_files.append((f, lines))
        
        output_files = []
        for f in step.outputs.files:
            # 假设输出文件平均 100 行
            output_files.append((f, 100))
        
        test_files = []
        for f in step.outputs.tests:
            test_files.append((f, 50))
        
        return self.estimator.estimate_step_tokens(
            input_files, output_files, test_files
        )
    
    def _split_step(self, step: Step, file_analyses: Dict) -> List[Step]:
        """拆分大步骤为多个小步骤"""
        sub_steps = []
        
        # 按输出文件分组
        files = step.outputs.files
        batch_size = max(1, len(files) // 2)
        
        for i in range(0, len(files), batch_size):
            batch_files = files[i:i + batch_size]
            
            sub_step = Step(
                id=f"{step.id}-sub{i//batch_size + 1}",
                task_id=step.task_id,
                sequence=0,  # 稍后重新排序
                title=f"{step.title} (Part {i//batch_size + 1})",
                description=f"{step.description}\n处理文件: {', '.join(batch_files)}",
                acceptance=[f"完成 {len(batch_files)} 个文件"],
                outputs=StepOutputs(files=batch_files),
                token_budget=TokenBudget(estimated=25000)
            )
            sub_steps.append(sub_step)
        
        return sub_steps if sub_steps else [step]
    
    def _merge_steps(self, step1: Step, step2: Step) -> Step:
        """合并两个步骤"""
        merged = Step(
            id=step1.id,
            task_id=step1.task_id,
            sequence=step1.sequence,
            title=f"{step1.title} + {step2.title}",
            description=f"{step1.description}\n\n附加: {step2.description}",
            acceptance=step1.acceptance + step2.acceptance,
            inputs=StepInputs(
                files=list(set(step1.inputs.files + step2.inputs.files)),
                context_from=list(set(step1.inputs.context_from + step2.inputs.context_from)),
                spec_refs=list(set(step1.inputs.spec_refs + step2.inputs.spec_refs))
            ),
            outputs=StepOutputs(
                files=list(set(step1.outputs.files + step2.outputs.files)),
                tests=list(set(step1.outputs.tests + step2.outputs.tests)),
                docs=list(set(step1.outputs.docs + step2.outputs.docs))
            ),
            token_budget=TokenBudget(
                estimated=step1.token_budget.estimated + step2.token_budget.estimated
            )
        )
        return merged
    
    def _topological_sort(self, steps: List[Step]) -> List[Step]:
        """拓扑排序步骤"""
        # 构建依赖图
        step_map = {s.id: s for s in steps}
        in_degree = {s.id: 0 for s in steps}
        adj = defaultdict(list)
        
        for step in steps:
            for dep_id in step.dependencies.steps:
                if dep_id in step_map:
                    adj[dep_id].append(step.id)
                    in_degree[step.id] += 1
        
        # Kahn 算法
        queue = [s for s in steps if in_degree[s.id] == 0]
        sorted_steps = []
        
        while queue:
            # 按类型优先级排序 (interface > data > core > ui > integration > test > doc)
            type_priority = {
                "interface": 1, "data": 2, "core": 3,
                "ui": 4, "integration": 5, "test": 6, "doc": 7
            }
            queue.sort(key=lambda s: type_priority.get(self._detect_step_type(s), 99))
            
            current = queue.pop(0)
            sorted_steps.append(current)
            
            for neighbor_id in adj[current.id]:
                in_degree[neighbor_id] -= 1
                if in_degree[neighbor_id] == 0:
                    neighbor = step_map[neighbor_id]
                    # 添加前置依赖
                    neighbor.inputs.context_from.append(current.id)
                    queue.append(neighbor)
        
        return sorted_steps
    
    def _detect_step_type(self, step: Step) -> str:
        """检测步骤类型"""
        title_lower = step.title.lower()
        
        if "接口" in title_lower or "api" in title_lower or "type" in title_lower:
            return "interface"
        elif "数据" in title_lower or "model" in title_lower or "schema" in title_lower:
            return "data"
        elif "ui" in title_lower or "组件" in title_lower or "页面" in title_lower:
            return "ui"
        elif "集成" in title_lower or "integration" in title_lower:
            return "integration"
        elif "测试" in title_lower or "test" in title_lower:
            return "test"
        elif "文档" in title_lower or "doc" in title_lower:
            return "doc"
        else:
            return "core"
    
    def save(self, output_path: str):
        """保存步骤到 JSON 文件"""
        data = {
            "taskId": self.task_id,
            "totalSteps": len(self.steps),
            "totalEstimatedTokens": sum(s.token_budget.estimated for s in self.steps),
            "steps": [s.to_dict() for s in self.steps]
        }
        
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        
        print(f"Steps saved to: {output_path}")


# ============ CLI ============

def main():
    parser = argparse.ArgumentParser(description="Task Decomposer - 任务拆解器")
    parser.add_argument("--prd", required=True, help="PRD 文件路径")
    parser.add_argument("--task-id", required=True, help="任务 ID")
    parser.add_argument("--project-root", default=".", help="项目根目录")
    parser.add_argument("--output", default="steps.json", help="输出文件路径")
    parser.add_argument("--files", nargs="+", help="相关文件列表")
    
    args = parser.parse_args()
    
    # 读取 PRD
    with open(args.prd, 'r', encoding='utf-8') as f:
        prd_content = f.read()
    
    # 解析验收标准 (简单实现: 从 PRD 提取)
    acceptance_criteria = []
    for line in prd_content.split('\n'):
        line = line.strip()
        if '验收' in line or 'AC' in line or 'acceptance' in line.lower():
            if line.startswith('- ') or line.startswith('* '):
                acceptance_criteria.append(line[2:])
    
    # 创建拆解器
    decomposer = TaskDecomposer(args.project_root, args.task_id)
    
    # 执行拆解
    steps = decomposer.decompose(
        prd_content=prd_content,
        acceptance_criteria=acceptance_criteria,
        related_files=args.files
    )
    
    # 保存结果
    decomposer.save(args.output)
    
    # 打印摘要
    print(f"\n{'='*60}")
    print(f"任务拆解完成: {args.task_id}")
    print(f"{'='*60}")
    print(f"总步骤数: {len(steps)}")
    print(f"预估总 Token: {sum(s.token_budget.estimated for s in steps):,}")
    print(f"\n步骤列表:")
    for step in steps:
        status = "✓" if decomposer.estimator.is_within_budget(step.token_budget.estimated) else "⚠"
        print(f"  {status} Step {step.sequence}: {step.title}")
        print(f"     预估 Token: {step.token_budget.estimated:,}")
        print(f"     验收: {len(step.acceptance)} 项")


if __name__ == "__main__":
    main()
