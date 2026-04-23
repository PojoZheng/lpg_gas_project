#!/usr/bin/env python3
"""
Trellis Bus - 消息总线与状态协调

提供基于文件系统的消息队列和状态同步机制。
目录: ~/.trellis-bus/

Usage:
    python trellis_bus.py --project lpg-gas --task task-001 --broadcast
"""

import json
import os
import time
import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional, Callable, Any
from enum import Enum
import argparse
import fcntl  # Unix file locking


# ============ 常量 ============

TRELLIS_BUS_ROOT = Path.home() / ".trellis-bus"
DEFAULT_TTL = 3600  # 消息默认生存时间 (秒)
HEARTBEAT_INTERVAL = 60  # 心跳间隔 (秒)


class MessageType(Enum):
    """消息类型枚举"""
    STEP_ASSIGN = "step.assign"
    STEP_START = "step.start"
    STEP_PROGRESS = "step.progress"
    STEP_COMPLETE = "step.complete"
    STEP_FAIL = "step.fail"
    STEP_BLOCK = "step.block"
    STEP_PAUSE = "step.pause"
    
    AGENT_HEARTBEAT = "agent.heartbeat"
    AGENT_REGISTER = "agent.register"
    AGENT_UNREGISTER = "agent.unregister"
    
    TASK_CREATE = "task.create"
    TASK_UPDATE = "task.update"
    TASK_COMPLETE = "task.complete"
    
    BROADCAST_COORDINATION = "broadcast.coordination"
    CONTEXT_UPDATE = "context.update"


class StepStatus(Enum):
    """步骤状态枚举"""
    PENDING = "pending"
    BLOCKED = "blocked"
    ASSIGNED = "assigned"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


# ============ 数据模型 ============

@dataclass
class MessageMetadata:
    """消息元数据"""
    sender: str  # Agent ID
    priority: int = 5  # 1-10, 数字越小优先级越高
    ttl: int = DEFAULT_TTL
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())
    
    def to_dict(self) -> Dict:
        return asdict(self)


@dataclass
class BusMessage:
    """总线消息"""
    id: str
    type: str
    project_id: str
    task_id: str
    payload: Dict
    metadata: MessageMetadata
    
    @classmethod
    def create(
        cls,
        msg_type: str,
        project_id: str,
        task_id: str,
        payload: Dict,
        sender: str,
        priority: int = 5
    ) -> "BusMessage":
        return cls(
            id=str(uuid.uuid4()),
            type=msg_type,
            project_id=project_id,
            task_id=task_id,
            payload=payload,
            metadata=MessageMetadata(
                sender=sender,
                priority=priority
            )
        )
    
    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "type": self.type,
            "projectId": self.project_id,
            "taskId": self.task_id,
            "payload": self.payload,
            "metadata": self.metadata.to_dict()
        }
    
    @classmethod
    def from_dict(cls, data: Dict) -> "BusMessage":
        return cls(
            id=data["id"],
            type=data["type"],
            project_id=data["projectId"],
            task_id=data["taskId"],
            payload=data["payload"],
            metadata=MessageMetadata(**data["metadata"])
        )


@dataclass
class ContextSnapshot:
    """上下文快照"""
    summary: str
    key_decisions: List[str] = field(default_factory=list)
    relevant_files: List[str] = field(default_factory=list)
    token_used: int = 0
    
    def to_dict(self) -> Dict:
        return asdict(self)


@dataclass
class AgentInfo:
    """Agent 信息"""
    id: str
    type: str  # dev-a, dev-b, dev-c, integrator, pm-architect
    worktree: Optional[str] = None
    status: str = "idle"  # idle, busy, offline
    current_task: Optional[str] = None
    current_step: Optional[str] = None
    last_heartbeat: str = field(default_factory=lambda: datetime.now().isoformat())
    capabilities: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict:
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: Dict) -> "AgentInfo":
        return cls(**data)


# ============ Trellis Bus 核心类 ============

class TrellisBus:
    """Trellis Bus 主类"""
    
    def __init__(self, project_id: str, bus_root: str = None):
        self.project_id = project_id
        self.bus_root = Path(bus_root) if bus_root else TRELLIS_BUS_ROOT
        self.project_dir = self.bus_root / "projects" / project_id
        
        self._init_directories()
    
    def _init_directories(self):
        """初始化目录结构"""
        dirs = [
            self.bus_root / "queue" / "pending",
            self.bus_root / "queue" / "processing",
            self.bus_root / "queue" / "completed",
            self.bus_root / "events" / datetime.now().strftime("%Y-%m-%d"),
            self.bus_root / "agents",
            self.bus_root / "shared-context" / self.project_id / "summaries",
            self.bus_root / "shared-context" / self.project_id / "artifacts",
            self.project_dir / "steps",
        ]
        
        for d in dirs:
            d.mkdir(parents=True, exist_ok=True)
    
    # ========== 消息队列操作 ==========
    
    def send(self, message: BusMessage) -> str:
        """
        发送消息到队列
        
        Returns:
            消息 ID
        """
        # 根据优先级选择队列
        queue_dir = self.bus_root / "queue" / "pending"
        
        # 高优先级消息使用特殊前缀确保排序
        priority_prefix = f"{message.metadata.priority:02d}_"
        filename = f"{priority_prefix}{message.id}.json"
        filepath = queue_dir / filename
        
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(message.to_dict(), f, indent=2, ensure_ascii=False)
        
        # 同时写入事件流
        self._append_to_event_stream(message)
        
        return message.id
    
    def receive(
        self,
        msg_types: Optional[List[str]] = None,
        agent_id: Optional[str] = None,
        timeout: int = 0
    ) -> Optional[BusMessage]:
        """
        接收消息
        
        Args:
            msg_types: 过滤消息类型
            agent_id: 指定接收 Agent (用于 direct message)
            timeout: 超时时间 (秒), 0 表示立即返回
            
        Returns:
            BusMessage 或 None
        """
        pending_dir = self.bus_root / "queue" / "pending"
        processing_dir = self.bus_root / "queue" / "processing"
        
        start_time = time.time()
        
        while True:
            # 获取所有待处理消息
            messages = sorted(pending_dir.glob("*.json"))
            
            for msg_file in messages:
                try:
                    with open(msg_file, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    
                    message = BusMessage.from_dict(data)
                    
                    # 类型过滤
                    if msg_types and message.type not in msg_types:
                        continue
                    
                    # 指定 Agent 过滤
                    if agent_id:
                        target_agent = message.payload.get("targetAgent")
                        if target_agent and target_agent != agent_id:
                            continue
                    
                    # 检查 TTL
                    msg_time = datetime.fromisoformat(message.metadata.timestamp)
                    elapsed = (datetime.now() - msg_time).total_seconds()
                    if elapsed > message.metadata.ttl:
                        # 过期消息, 移动到 completed
                        msg_file.rename(self.bus_root / "queue" / "completed" / msg_file.name)
                        continue
                    
                    # 移动到 processing
                    processing_file = processing_dir / msg_file.name
                    msg_file.rename(processing_file)
                    
                    return message
                    
                except Exception as e:
                    print(f"Error processing message file {msg_file}: {e}")
                    continue
            
            # 检查超时
            if timeout == 0 or (time.time() - start_time) >= timeout:
                return None
            
            time.sleep(0.1)
    
    def ack(self, message_id: str, success: bool = True, result: Dict = None):
        """
        确认消息处理完成
        
        Args:
            message_id: 消息 ID
            success: 是否成功处理
            result: 处理结果
        """
        processing_dir = self.bus_root / "queue" / "processing"
        completed_dir = self.bus_root / "queue" / "completed"
        
        # 查找处理中的消息文件
        for msg_file in processing_dir.glob(f"*_{message_id}.json"):
            if success:
                # 移动到 completed
                target = completed_dir / msg_file.name
                
                # 更新结果
                with open(msg_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                
                data["processedAt"] = datetime.now().isoformat()
                data["success"] = True
                if result:
                    data["result"] = result
                
                with open(msg_file, 'w', encoding='utf-8') as f:
                    json.dump(data, f, indent=2)
                
                msg_file.rename(target)
            else:
                # 失败, 移回 pending (带重试计数)
                with open(msg_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                
                retry_count = data.get("retryCount", 0) + 1
                if retry_count > 3:
                    # 超过重试次数, 标记为失败
                    data["status"] = "failed"
                    data["failedAt"] = datetime.now().isoformat()
                    target = completed_dir / msg_file.name.replace(".json", "_failed.json")
                else:
                    data["retryCount"] = retry_count
                    target = self.bus_root / "queue" / "pending" / msg_file.name
                
                with open(msg_file, 'w', encoding='utf-8') as f:
                    json.dump(data, f, indent=2)
                
                msg_file.rename(target)
            
            return
    
    def _append_to_event_stream(self, message: BusMessage):
        """追加到事件流"""
        today = datetime.now().strftime("%Y-%m-%d")
        event_dir = self.bus_root / "events" / today
        event_dir.mkdir(parents=True, exist_ok=True)
        
        timestamp = datetime.now().strftime("%H%M%S_%f")
        filename = f"{timestamp}_{message.type.replace('.', '_')}.json"
        filepath = event_dir / filename
        
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(message.to_dict(), f, indent=2, ensure_ascii=False)
    
    # ========== Agent 管理 ==========
    
    def register_agent(self, agent_info: AgentInfo):
        """注册 Agent"""
        filepath = self.bus_root / "agents" / f"{agent_info.id}.json"
        
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(agent_info.to_dict(), f, indent=2, ensure_ascii=False)
        
        # 发送注册消息
        message = BusMessage.create(
            msg_type=MessageType.AGENT_REGISTER.value,
            project_id=self.project_id,
            task_id="system",
            payload=agent_info.to_dict(),
            sender=agent_info.id
        )
        self.send(message)
    
    def unregister_agent(self, agent_id: str):
        """注销 Agent"""
        filepath = self.bus_root / "agents" / f"{agent_id}.json"
        
        if filepath.exists():
            # 发送注销消息
            message = BusMessage.create(
                msg_type=MessageType.AGENT_UNREGISTER.value,
                project_id=self.project_id,
                task_id="system",
                payload={"agentId": agent_id},
                sender=agent_id
            )
            self.send(message)
            
            filepath.unlink()
    
    def heartbeat(self, agent_id: str, status_update: Dict = None):
        """Agent 心跳"""
        filepath = self.bus_root / "agents" / f"{agent_id}.json"
        
        if not filepath.exists():
            return
        
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        data["lastHeartbeat"] = datetime.now().isoformat()
        
        if status_update:
            data.update(status_update)
        
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)
        
        # 发送心跳消息
        message = BusMessage.create(
            msg_type=MessageType.AGENT_HEARTBEAT.value,
            project_id=self.project_id,
            task_id=data.get("currentTask", "system"),
            payload={
                "agentId": agent_id,
                "status": data.get("status", "idle"),
                "currentStep": data.get("currentStep")
            },
            sender=agent_id
        )
        self.send(message)
    
    def get_agent(self, agent_id: str) -> Optional[AgentInfo]:
        """获取 Agent 信息"""
        filepath = self.bus_root / "agents" / f"{agent_id}.json"
        
        if not filepath.exists():
            return None
        
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        return AgentInfo.from_dict(data)
    
    def list_agents(self, agent_type: str = None) -> List[AgentInfo]:
        """列出所有 Agent"""
        agents = []
        agents_dir = self.bus_root / "agents"
        
        for filepath in agents_dir.glob("*.json"):
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            if agent_type and data.get("type") != agent_type:
                continue
            
            agents.append(AgentInfo.from_dict(data))
        
        return agents
    
    def check_agent_health(self, agent_id: str) -> Dict:
        """检查 Agent 健康状态"""
        agent = self.get_agent(agent_id)
        
        if not agent:
            return {"healthy": False, "reason": "not_found"}
        
        last_hb = datetime.fromisoformat(agent.last_heartbeat)
        elapsed = (datetime.now() - last_hb).total_seconds()
        
        if elapsed > HEARTBEAT_INTERVAL * 3:
            return {"healthy": False, "reason": "heartbeat_timeout", "elapsed": elapsed}
        
        return {"healthy": True, "elapsed": elapsed}
    
    # ========== 任务协调 ==========
    
    def broadcast_task(
        self,
        task_id: str,
        steps: List[Dict],
        assignments: Dict[str, str],  # step_id -> agent_id
        coordinator_id: str = "pm-architect"
    ):
        """
        广播任务给多个 Agent
        
        Args:
            task_id: 任务 ID
            steps: 步骤列表
            assignments: 步骤分配映射 {step_id: agent_id}
            coordinator_id: 协调器 ID
        """
        # 1. 保存任务状态
        task_state = {
            "taskId": task_id,
            "status": "broadcasting",
            "totalSteps": len(steps),
            "completedSteps": 0,
            "steps": {s["id"]: s for s in steps},
            "assignments": assignments,
            "broadcastAt": datetime.now().isoformat(),
            "coordinatorId": coordinator_id
        }
        
        state_file = self.project_dir / "state.json"
        with open(state_file, 'w', encoding='utf-8') as f:
            json.dump(task_state, f, indent=2, ensure_ascii=False)
        
        # 2. 给每个 Agent 发送分配消息
        for step in steps:
            step_id = step["id"]
            agent_id = assignments.get(step_id)
            
            if not agent_id:
                continue
            
            # 构建上下文快照
            context = self._build_context_snapshot(step, steps)
            
            message = BusMessage.create(
                msg_type=MessageType.STEP_ASSIGN.value,
                project_id=self.project_id,
                task_id=task_id,
                payload={
                    "stepId": step_id,
                    "step": step,
                    "contextSnapshot": context.to_dict(),
                    "targetAgent": agent_id
                },
                sender=coordinator_id,
                priority=step.get("priority", 5)
            )
            
            self.send(message)
            
            # 更新步骤状态
            step["status"] = "assigned"
            step["assignedTo"] = agent_id
        
        # 3. 发送协调广播
        coord_message = BusMessage.create(
            msg_type=MessageType.BROADCAST_COORDINATION.value,
            project_id=self.project_id,
            task_id=task_id,
            payload={
                "type": "task_broadcast",
                "totalSteps": len(steps),
                "assignments": assignments,
                "summary": f"任务 {task_id} 已分配给 {len(set(assignments.values()))} 个 Agent"
            },
            sender=coordinator_id,
            priority=1  # 最高优先级
        )
        self.send(coord_message)
        
        # 4. 更新任务状态
        task_state["status"] = "running"
        with open(state_file, 'w', encoding='utf-8') as f:
            json.dump(task_state, f, indent=2, ensure_ascii=False)
        
        print(f"[TrellisBus] 任务 {task_id} 广播完成")
        print(f"  - 总步骤: {len(steps)}")
        print(f"  - 分配 Agent: {len(set(assignments.values()))}")
        for agent_id in set(assignments.values()):
            agent_steps = [s for s in steps if assignments.get(s["id"]) == agent_id]
            print(f"    · {agent_id}: {len(agent_steps)} 个步骤")
    
    def _build_context_snapshot(self, step: Dict, all_steps: List[Dict]) -> ContextSnapshot:
        """构建上下文快照"""
        # 获取依赖步骤
        dep_ids = step.get("inputs", {}).get("contextFrom", [])
        dep_summaries = []
        
        for dep_id in dep_ids:
            for s in all_steps:
                if s["id"] == dep_id:
                    dep_summaries.append(f"{s['title']}: {s.get('result', {}).get('summary', 'completed')}")
        
        return ContextSnapshot(
            summary=step.get("description", ""),
            key_decisions=dep_summaries,
            relevant_files=step.get("inputs", {}).get("files", [])
        )
    
    def update_step_status(
        self,
        task_id: str,
        step_id: str,
        status: str,
        result: Dict = None,
        agent_id: str = None
    ):
        """更新步骤状态"""
        state_file = self.project_dir / "state.json"
        
        if not state_file.exists():
            return
        
        with open(state_file, 'r', encoding='utf-8') as f:
            task_state = json.load(f)
        
        if step_id not in task_state.get("steps", {}):
            return
        
        step = task_state["steps"][step_id]
        step["status"] = status
        
        if status == "running":
            step["startedAt"] = datetime.now().isoformat()
        elif status in ["completed", "failed"]:
            step["completedAt"] = datetime.now().isoformat()
        
        if result:
            step["result"] = result
        
        if agent_id:
            step["executedBy"] = agent_id
        
        # 更新完成计数
        completed = sum(1 for s in task_state["steps"].values() if s.get("status") == "completed")
        task_state["completedSteps"] = completed
        
        # 检查是否全部完成
        if completed == task_state["totalSteps"]:
            task_state["status"] = "completed"
            task_state["completedAt"] = datetime.now().isoformat()
        
        with open(state_file, 'w', encoding='utf-8') as f:
            json.dump(task_state, f, indent=2, ensure_ascii=False)
    
    def get_task_state(self, task_id: str) -> Optional[Dict]:
        """获取任务状态"""
        state_file = self.project_dir / "state.json"
        
        if not state_file.exists():
            return None
        
        with open(state_file, 'r', encoding='utf-8') as f:
            return json.load(f)


# ============ CLI ============

def main():
    parser = argparse.ArgumentParser(description="Trellis Bus CLI")
    parser.add_argument("--project", required=True, help="项目 ID")
    parser.add_argument("--task", help="任务 ID")
    parser.add_argument("--agent", help="Agent ID")
    
    subparsers = parser.add_subparsers(dest="command", help="命令")
    
    # register 命令
    register_parser = subparsers.add_parser("register", help="注册 Agent")
    register_parser.add_argument("--type", default="dev", help="Agent 类型")
    register_parser.add_argument("--worktree", help="Worktree 路径")
    
    # heartbeat 命令
    heartbeat_parser = subparsers.add_parser("heartbeat", help="发送心跳")
    heartbeat_parser.add_argument("--status", default="idle", help="当前状态")
    
    # send 命令
    send_parser = subparsers.add_parser("send", help="发送消息")
    send_parser.add_argument("--type", required=True, help="消息类型")
    send_parser.add_argument("--payload", default="{}", help="消息负载 (JSON)")
    send_parser.add_argument("--priority", type=int, default=5, help="优先级")
    
    # receive 命令
    receive_parser = subparsers.add_parser("receive", help="接收消息")
    receive_parser.add_argument("--types", nargs="+", help="消息类型过滤")
    receive_parser.add_argument("--timeout", type=int, default=0, help="超时时间")
    
    # status 命令
    status_parser = subparsers.add_parser("status", help="查看状态")
    
    # agents 命令
    agents_parser = subparsers.add_parser("agents", help="列出所有 Agent")
    
    args = parser.parse_args()
    
    bus = TrellisBus(args.project)
    
    if args.command == "register":
        agent = AgentInfo(
            id=args.agent,
            type=args.type,
            worktree=args.worktree,
            capabilities=["coding", "testing"]
        )
        bus.register_agent(agent)
        print(f"Agent {args.agent} registered")
    
    elif args.command == "heartbeat":
        bus.heartbeat(args.agent, {"status": args.status})
        print(f"Heartbeat sent from {args.agent}")
    
    elif args.command == "send":
        payload = json.loads(args.payload)
        message = BusMessage.create(
            msg_type=args.type,
            project_id=args.project,
            task_id=args.task or "default",
            payload=payload,
            sender=args.agent or "cli",
            priority=args.priority
        )
        msg_id = bus.send(message)
        print(f"Message sent: {msg_id}")
    
    elif args.command == "receive":
        message = bus.receive(
            msg_types=args.types,
            agent_id=args.agent,
            timeout=args.timeout
        )
        if message:
            print(json.dumps(message.to_dict(), indent=2, ensure_ascii=False))
        else:
            print("No message received")
    
    elif args.command == "status":
        state = bus.get_task_state(args.task) if args.task else None
        if state:
            print(json.dumps(state, indent=2, ensure_ascii=False))
        else:
            print(f"No state found for task {args.task}")
    
    elif args.command == "agents":
        agents = bus.list_agents()
        for agent in agents:
            health = bus.check_agent_health(agent.id)
            status = "✓" if health["healthy"] else "✗"
            print(f"{status} {agent.id} ({agent.type}) - {agent.status}")
    
    else:
        # 显示目录结构
        print("Trellis Bus 目录结构:")
        for path in sorted(bus.bus_root.rglob("*")):
            if path.is_dir():
                level = len(path.relative_to(bus.bus_root).parts)
                indent = "  " * level
                print(f"{indent}{path.name}/")


if __name__ == "__main__":
    main()
