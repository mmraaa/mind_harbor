import logging
import sys

_CONFIGURED = False


def setup_logging(level: int = logging.INFO) -> None:
    """一次性配置标准库日志:控制台输出 + 统一格式。"""
    global _CONFIGURED
    if _CONFIGURED:
        return
    root = logging.getLogger()
    root.setLevel(level)
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        logging.Formatter(
            "%(asctime)s %(levelname)s [%(name)s] %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
    )
    root.addHandler(handler)
    _CONFIGURED = True
