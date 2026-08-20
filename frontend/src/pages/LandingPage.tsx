import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

const scenes = [
  {
    id: 'forest',
    image: '/images/forest.jpg',
    kicker: '01 / FOREST',
    title: '穿过树影，把呼吸还给自己。',
    body: '不急着给情绪命名，先感受一阵风从树叶间慢慢穿过。',
  },
  {
    id: 'mountain',
    image: '/images/mountain.jpg',
    kicker: '02 / MOUNTAIN',
    title: '把目光放远，心也会宽一点。',
    body: '有些答案不在今天抵达，但你已经在往更开阔的地方走。',
  },
  {
    id: 'leaves',
    image: '/images/leaves.jpg',
    kicker: '03 / LEAVES',
    title: '一片叶子的光，也值得看很久。',
    body: '把注意力放回细小、真实、此刻仍在发生的事上。',
  },
] as const

export default function LandingPage() {
  const [selectedScene, setSelectedScene] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSelectedScene((current) => (current + 1) % scenes.length)
    }, 5200)
    return () => window.clearInterval(timer)
  }, [])

  const scene = scenes[selectedScene]

  return (
    <main className="landing-page">
      <header className="landing-nav">
        <Link className="wordmark" to="/">
          <span className="wordmark-mark">M</span>
          MindHarbor
        </Link>
        <nav aria-label="主要导航">
          <a href="#about">关于陪伴</a>
          <a href="#moments">自然时刻</a>
          <Link to="/auth/login">登录</Link>
        </nav>
      </header>

      <section className="landing-hero" aria-labelledby="hero-heading">
        <img className="landing-hero-image" src="/images/pet-friends.jpg" alt="在草地上彼此依偎的宠物" />
        <div className="landing-sunbeam landing-sunbeam-one" aria-hidden="true" />
        <div className="landing-sunbeam landing-sunbeam-two" aria-hidden="true" />
        <div className="landing-hero-copy">
          <p className="eyebrow eyebrow-light">A QUIETER PLACE TO BE YOURSELF</p>
          <h1 id="hero-heading">给心一个<br />可以靠岸的地方。</h1>
          <p>MindHarbor 把温柔的陪伴，留在每一个需要慢下来的时刻。</p>
          <div className="landing-hero-actions">
            <Link className="button button-sun" to="/auth/register">开始一段陪伴</Link>
            <a className="text-link text-link-light" href="#about">看看这里有什么</a>
          </div>
        </div>
        <p className="landing-hero-side">SUNLIGHT<br />PAWS<br />A PLACE TO LAND</p>
      </section>

      <section className="landing-marquee" aria-label="MindHarbor 关键词">
        <div>
          <span>慢一点</span><span>倾听</span><span>晒晒太阳</span><span>有人陪着</span><span>慢一点</span><span>倾听</span><span>晒晒太阳</span><span>有人陪着</span>
        </div>
      </section>

      <section id="about" className="landing-intro section-wrap" aria-labelledby="about-heading">
        <p className="section-number">01 / A SMALL HARBOR</p>
        <div>
          <h2 id="about-heading">不必时刻坚强，<br />也不必独自消化。</h2>
          <p>在这里，你可以先把心事放下，和一段安静的对话待一会儿。无论是想说说今天，还是只想停一停，MindHarbor 都为你留着一盏温暖的灯。</p>
        </div>
        <div className="landing-intro-note">
          <span>每一天，给自己一点被好好听见的时间。</span>
        </div>
      </section>

      <section id="moments" className="landing-scenes" aria-labelledby="scene-heading">
        <div className="section-wrap landing-scenes-head">
          <div>
            <p className="section-number">02 / OUTSIDE, WITHIN</p>
            <h2 id="scene-heading">先去一处<br />有光的地方。</h2>
          </div>
          <p>让目光停在真实的自然里。这里的每一帧，都会在片刻后轻轻换场，也可以由你决定下一处风景。</p>
        </div>
        <div className="landing-scene-stage">
          {scenes.map((item, index) => (
            <img
              key={item.id}
              className={index === selectedScene ? 'is-visible' : ''}
              src={item.image}
              alt=""
              aria-hidden={index !== selectedScene}
            />
          ))}
          <div className="landing-scene-copy">
            <p>{scene.kicker}</p>
            <h3>{scene.title}</h3>
            <span>{scene.body}</span>
          </div>
          <div className="landing-scene-controls" role="tablist" aria-label="选择自然场景">
            {scenes.map((item, index) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={index === selectedScene}
                className={index === selectedScene ? 'is-selected' : ''}
                onClick={() => setSelectedScene(index)}
              >
                <span>{String(index + 1).padStart(2, '0')}</span>{item.id}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-pet section-wrap" aria-labelledby="pet-heading">
        <div className="landing-pet-photo-wrap">
          <img src="/images/hero-dog.jpg" alt="阳光下安静坐着的小狗" />
          <p>COMPANY NEEDS NO BIG WORDS</p>
        </div>
        <div className="landing-pet-copy">
          <p className="section-number">03 / THE SOFTEST COMPANY</p>
          <h2 id="pet-heading">陪伴有时<br />只是安静地在。</h2>
          <p>一只小狗趴在脚边，一束阳光落在肩上。那些没有刻意安慰的瞬间，也能让人重新感到自己被世界温柔接住。</p>
          <Link className="text-link" to="/auth/register">带着这份温暖进入 MindHarbor</Link>
        </div>
      </section>

      <section className="landing-entry" aria-labelledby="entry-heading">
        <div className="section-wrap">
          <p className="section-number">READY WHEN YOU ARE</p>
          <h2 id="entry-heading">从今天开始，<br />给自己多一点空间。</h2>
          <div className="landing-entry-actions">
            <Link className="button button-primary" to="/auth/register">创建用户账号</Link>
            <Link className="text-link" to="/auth/login">我已经有账号</Link>
          </div>
        </div>
      </section>

      <footer className="landing-footer section-wrap">
        <Link className="wordmark" to="/">
          <span className="wordmark-mark">M</span>
          MindHarbor
        </Link>
        <span>陪你慢慢靠岸</span>
      </footer>
    </main>
  )
}
