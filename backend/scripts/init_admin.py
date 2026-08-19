"""初始化管理员运营表并创建/重置本地测试管理员。

只对当前 .env 指向的数据库执行，不通过公开注册接口创建管理员。
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.admin_module.models import AccountControl  # noqa: F401
from app.core.database import Base, SessionLocal, engine
from app.core.security import hash_password
from app.models.user import User


def main() -> None:
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        admin = db.query(User).filter_by(username="admin").first()
        if admin is None:
            admin = User(username="admin", role="admin", name="管理员", password_hash=hash_password("admin123"))
            db.add(admin)
            db.flush()
        else:
            admin.role = "admin"
            admin.name = "管理员"
            admin.password_hash = hash_password("admin123")
        control = db.query(AccountControl).filter_by(user_id=admin.id).first()
        if control is None:
            db.add(AccountControl(user_id=admin.id, is_enabled=True))
        else:
            control.is_enabled = True
        db.commit()
        print(f"管理员已就绪: username=admin user_id={admin.id}")


if __name__ == "__main__":
    main()
