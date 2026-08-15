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
        "type": "求助渠道",
        "content": (
            "24小时心理援助热线:学校心理援助热线 156653、全国统一心理援助热线 12356、"
            "青少年心理咨询和法律援助热线 12355。心理中心预约电话 15236033543,"
            "电子邮箱 xlzx@ndpu.edu.cn。"
        ),
        "url": "",
    },
    {
        "title": "校园心理咨询预约流程",
        "type": "求助渠道",
        "content": (
            "三种预约方式:现场预约(工作时间前往校区心理中心接待室填写《心理咨询预约登记表》)、"
            "电话预约(拨打预约电话告知姓名/学号/院系/空闲时间)、线上预约(登录预约系统选时段提交);"
            "预约成功后电话或短信通知时间与地点。"
        ),
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
