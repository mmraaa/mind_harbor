export default function PracticePage() {
  return (
    <div>
      <header className="page-header">
        <div>
          <p className="page-header__eyebrow">SELF CARE</p>
          <h1>放松练习</h1>
          <p className="page-header__description">
            短时可完成的放松引导。聊天里也可以随时唤起同款练习卡片。
          </p>
        </div>
      </header>

      <div className="practice-grid">
        <section className="practice-hero">
          <div>
            <h2 style={{ fontSize: '1.55rem', marginBottom: '0.55rem' }}>港湾呼吸 · 4-2-6</h2>
            <p style={{ color: 'var(--muted)', marginBottom: '1rem' }}>
              跟随涟漪扩张与回落。四秒吸入、两秒停顿、六秒缓慢呼出。适合考试前或入睡前。
            </p>
            <button type="button" className="primary-button">
              开始 2 分钟练习
            </button>
          </div>
          <div className="breath-ring" aria-hidden>
            <span>吸 · 停 · 呼</span>
          </div>
        </section>

        {[
          { title: '身体扫描', desc: '从脚趾到头顶，依次感受紧绷并轻轻松开。约 4 分钟。' },
          { title: '五感着陆', desc: '说出 5 件看见、4 件触摸、3 件听见的事物，把注意力带回当下。' },
          { title: '温柔自我对话', desc: '用一句可对自己说的话，替换自我苛责。' },
        ].map((item) => (
          <article key={item.title} className="card-item">
            <h3>{item.title}</h3>
            <p>{item.desc}</p>
            <button type="button" className="ghost-button">
              打开引导
            </button>
          </article>
        ))}
      </div>
    </div>
  )
}
