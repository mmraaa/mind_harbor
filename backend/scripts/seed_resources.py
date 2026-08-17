"""写入真实心理自助资源(书籍 / 文章 / 游戏)到 resources 表。

用法(working dir: backend/):
    .venv/bin/python scripts/seed_resources.py

幂等:按 title 去重——已存在则更新 type/content/url/is_active,不存在则新增。
type 使用中文值:文章 / 书籍 / 游戏。
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.resource import Resource

# 数据来源说明:
# - 书籍:豆瓣读书条目页(book.douban.com),均为真实出版书籍。
# - 文章:澎湃新闻(简单心理出品)、壹心理、世界卫生组织、央视网,均真实可访问。
# - 游戏:Steam 商店页(store.steampowered.com),均为心理健康主题游戏。
# 所有 URL 均已于 2026-08-15 逐一验证可访问。
SEED_RESOURCES = [
    # ---------- 书籍 ----------
    {
        "title": "蛤蟆先生去看心理医生",
        "type": "书籍",
        "content": "借英国经典《柳林风声》主角蛤蟆先生的 10 次心理咨询故事,带你认识抑郁、焦虑与自我成长,是轻松入门的心理自助书。",
        "url": "https://book.douban.com/subject/36062217/",
        "is_active": True,
    },
    {
        "title": "也许你该找个人聊聊",
        "type": "书籍",
        "content": "心理治疗师洛莉·戈特利布的回忆录,从治疗师与来访者双重视角,展现心理治疗如何帮助人自我觉察、疗愈创伤。",
        "url": "https://book.douban.com/subject/35481512/",
        "is_active": True,
    },
    {
        "title": "被讨厌的勇气",
        "type": "书籍",
        "content": "以青年与哲人的对话形式解读阿德勒心理学,核心是“课题分离”与“活在当下”,帮你摆脱人际烦恼、获得被讨厌的勇气。",
        "url": "https://book.douban.com/subject/26369699/",
        "is_active": True,
    },
    {
        "title": "正念的奇迹",
        "type": "书籍",
        "content": "一行禅师讲述如何在日常行走坐卧中保持正念觉知,通过呼吸与当下觉察获得内心平静,适合压力大时练习。",
        "url": "https://book.douban.com/subject/4726852/",
        "is_active": True,
    },
    # ---------- 文章 ----------
    {
        "title": "毕业季焦虑,你准备好面对职场了吗?",
        "type": "文章",
        "content": "澎湃新闻·简单心理:针对毕业求职焦虑,咨询师给出接纳情绪、自我关怀与重建连接的实用建议。",
        "url": "https://www.thepaper.cn/newsDetail_forward_9663246",
        "is_active": True,
    },
    {
        "title": "如何判断自己是抑郁情绪、性格问题,还是抑郁症?",
        "type": "文章",
        "content": "壹心理科普:从诱因、持续时间、功能损害三个方面帮你区分抑郁情绪与抑郁症,并给出何时求助的建议。",
        "url": "https://m.xinli001.com/qa/answer-6022017",
        "is_active": True,
    },
    {
        "title": "2023年世界精神卫生日:精神健康是一项普遍人权",
        "type": "文章",
        "content": "世界卫生组织(WHO)专题页:介绍全球精神健康现状,强调精神健康是一项普遍人权,并附相关资源。",
        "url": "https://www.who.int/zh/campaigns/world-mental-health-day/2023",
        "is_active": True,
    },
    {
        "title": "出现抑郁表现,就是得了抑郁症吗?| 科普时间",
        "type": "文章",
        "content": "央视网科普:抑郁情绪、抑郁状态与抑郁症三个概念要区分开,若持续两周以上的低落情绪并影响生活,需及时就医。",
        "url": "https://news.cctv.com/2025/05/22/ARTIVmLLFvITfcrxe20mcV2N250522.shtml",
        "is_active": True,
    },
    # ---------- 游戏 ----------
    {
        "title": "Celeste(蔚蓝)",
        "type": "游戏",
        "content": "以克服焦虑与抑郁为主题的平台跳跃游戏,主角攀爬塞莱斯特山的过程是直面内心“另一个自己”的隐喻,剧情疗愈且内置辅助模式。",
        "url": "https://store.steampowered.com/app/504230/Celeste/",
        "is_active": True,
    },
    {
        "title": "GRIS",
        "type": "游戏",
        "content": "无文字、无失败惩罚的唯美平台游戏,女孩在灰白世界中穿行,色彩随哀伤的五阶段(否认/愤怒/妥协/抑郁/接纳)逐渐点亮,温柔讲述疗愈与接纳。",
        "url": "https://store.steampowered.com/app/683320/GRIS/",
        "is_active": True,
    },
    {
        "title": "Spiritfarer(Farewell 版)",
        "type": "游戏",
        "content": "关于“离别与哀悼”的治愈系管理游戏,你扮演摆渡人引导灵魂前往来世,学会好好告别、珍惜当下的陪伴。",
        "url": "https://store.steampowered.com/app/972660/Spiritfarer_Farewell/",
        "is_active": True,
    },
    {
        "title": "Florence",
        "type": "游戏",
        "content": "约 30 分钟的互动叙事游戏,记录一段恋爱从相遇到分手的完整历程,细腻呈现“放下”与“重新找回自己”的情感体验。",
        "url": "https://store.steampowered.com/app/1102130/Florence/",
        "is_active": True,
    },
]


def seed(db: Session) -> None:
    inserted = 0
    updated = 0
    for r in SEED_RESOURCES:
        existing = db.query(Resource).filter_by(title=r["title"]).first()
        if existing is None:
            db.add(Resource(**r))
            inserted += 1
            print(f"[+] 新增资源 {r['title']} ({r['type']})")
        else:
            # 幂等:已存在则同步最新简介/链接/类型/启用状态
            existing.type = r["type"]
            existing.content = r["content"]
            existing.url = r["url"]
            existing.is_active = r["is_active"]
            updated += 1
            print(f"[~] 更新资源 {r['title']} ({r['type']})")
    db.commit()
    print(f"[ok] 资源写入完成:新增 {inserted} 条,更新 {updated} 条")


if __name__ == "__main__":
    db = SessionLocal()
    try:
        seed(db)
    finally:
        db.close()
