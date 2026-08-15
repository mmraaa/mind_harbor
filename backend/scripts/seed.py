"""种子数据:三角色账号 + 示例咨询师 + 示例心理资源。

用法(working dir: backend/):
    python scripts/seed.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models.resource import Resource
from app.models.user import Counselor, User

SEED_USERS = [
    ("admin", "admin", "管理员", "admin123"),
    ("counselor", "counselor", "咨询师一号", "counselor123"),
    ("student", "student", "测试学生", "student123"),
]

SEED_RESOURCES = [
    {
        "title": "危机干预热线",
        "type": "contact",
        "content": "心理危机干预热线 400-161-9995(示例,演示前请替换为当地真实热线)",
        "url": "",
    },
    {
        "title": "校园心理咨询预约流程",
        "type": "article",
        "content": "一般流程:线上/线下预约 → 初次评估 → 一对一咨询。具体请以本校学生工作处通知为准。",
        "url": "",
    },
    {
        "title": "考前压力应对",
        "type": "article",
        "content": "考前焦虑常见应对:规律作息、拆分复习计划、适度运动、正念呼吸。",
        "url": "",
    },
    {
        "title": "478 呼吸练习",
        "type": "practice",
        "content": "吸气 4 秒 → 屏息 7 秒 → 呼气 8 秒,循环 4 组,帮助平复情绪。",
        "url": "",
    },
]


def seed(db: Session) -> None:
    created: dict[str, int] = {}
    for role, username, name, pwd in SEED_USERS:
        user = db.query(User).filter_by(username=username).first()
        if user is None:
            user = User(role=role, username=username, name=name, password_hash=hash_password(pwd))
            db.add(user)
            db.flush()
            print(f"[+] 创建用户 {username}({role})")
        created[role] = user.id

    # 咨询师资料(挂在 counselor 账号下)
    if db.query(Counselor).filter_by(user_id=created["counselor"]).first() is None:
        db.add(
            Counselor(
                user_id=created["counselor"],
                title="心理咨询师",
                specialty="情绪疏导 / 学业压力 / 人际困扰",
                bio="示例咨询师资料,可在管理端维护。",
            )
        )
        print("[+] 创建咨询师资料")

    # 示例心理资源
    for r in SEED_RESOURCES:
        if db.query(Resource).filter_by(title=r["title"]).first() is None:
            db.add(Resource(**r))
            print(f"[+] 创建资源 {r['title']}")

    db.commit()
    print("[ok] 种子数据完成")


if __name__ == "__main__":
    db = SessionLocal()
    try:
        seed(db)
    finally:
        db.close()
