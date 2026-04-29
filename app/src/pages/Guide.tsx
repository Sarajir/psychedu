interface Props {
  onStart: () => void;
}

const STEPS = [
  {
    title: "① 预测（Predict）",
    body: `在「Today」里填写 **Topic（主题）** 与 **一句可检验的预测**（例如：这章我会卡在哪个概念、这篇论文的核心结论我猜是什么）。**预测一句话是进入下一步的必填项**；若暂时不想写主题，可先只写预测，点「Start」时会自动用占位标题，你之后仍可改。
再选**信心 1–5**；若是课业单元，还可填**预计耗时**（之后对照「实际耗时」）。
可选：**上传 PDF / 讲义**作为稍后要对照的「标准答案源」，但下一步**先不要打开**。`,
  },
  {
    title: "② 闭卷回忆（Retrieve）",
    body: `点击开始后，在**限时内**不看任何材料，把脑子里能写出的要点写下来。
这一步练的是**提取练习（retrieval practice）**：能主动写出来的，才更可能真的掌握；被动重读往往「看懂错觉」。
若你上传了文档，此时界面会提醒：**先别开文件**，保持闭卷。`,
  },
  {
    title: "③ 对照与打标签（Compare）",
    body: `现在可以打开课本、论文或你上传的文件，**对照**你的预测和闭卷写下的内容。
用标签记录**差在哪一类**：例如高估/低估难度、概念混淆、整块没想起来等。
若是「读文献」模式，还要写**一个下次要追问的问题**，方便下一轮思考。
最后保存为一个**学习单元**；数据会进入「My biases」统计，并进入间隔复习队列。`,
  },
  {
    title: "④ 间隔复习（Recall queue）",
    body: `系统按 **1 → 3 → 7 → 14 → 30 天** 把旧单元带回「Recall queue」。
每次只做**一两句再回忆**，自评通过/不通过；不通过会缩短间隔，通过则拉长。
这与**间隔效应**一致：在快忘时轻量提取，比一次性死背更省时间、更牢。`,
  },
  {
    title: "⑤ 看自己的偏差（My biases）",
    body: `汇总你打过的标签、复习通过率、以及（若填写）**时间预测偏差**。
目的不是打分，而是看清：**你系统性高估还是低估某类任务、哪类错误最常出现**，从而调整下一轮怎么学。
可**导出 CSV**，方便写文书、给 mentor 看，或自己做周回顾。`,
  },
];

export function GuidePage({ onStart }: Props) {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8 pb-16">
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-accent">
          教程 · 这个产品在做什么
        </p>
        <h1 className="text-2xl font-semibold text-ink-900">
          psychedu：给自己用的「预测—提取—对照」学习台
        </h1>
        <p className="text-sm text-ink-600 leading-relaxed">
          它不是社交软件，也不是「锁手机番茄钟」。它只做一件事：帮你把**学习科学里几条很朴素的规律**落实成**固定按钮流程**，并留下**你自己的数据**（预测、回忆、标签、间隔复习结果）。
        </p>
      </header>

      <section className="card p-6 space-y-3 bg-teal-50/40 border-teal-100">
        <h2 className="text-base font-semibold text-ink-900">一句话理解</h2>
        <p className="text-sm text-ink-700 leading-relaxed">
          <strong>先预测 → 再闭卷写 → 再对照真相 → 打标签记录误差 → 过几天再轻量回忆。</strong>
          这样你在练两件事：<strong>元认知</strong>（我猜得准不准）和<strong>记忆提取</strong>（不看书能不能写出来），而不是只统计「坐了多久」。
        </p>
      </section>

      <section className="card p-6 space-y-2 border-ink-100">
        <h2 className="text-base font-semibold text-ink-900">可选：「AI」页是干什么的？</h2>
        <p className="text-sm text-ink-700 leading-relaxed">
          顶部导航的<strong>「AI」</strong>是<strong>额外脚手架</strong>：你上传 PDF/图片或说明主题，用<strong>自己的</strong>
          Gemini API Key + 你部署的 Cloudflare Worker，让模型生成「复习提纲 / 填空 / 问答卡」等<strong>中文学习材料</strong>。
          它<strong>不替代</strong>上面的「预测—闭卷—对照」闭环；更合理的用法是：把生成内容当作「材料」，再放进「Today」里做闭卷与校准。
        </p>
        <p className="text-xs text-ink-500">
          部署说明见仓库目录 <code className="bg-ink-100 px-1 rounded">workers/gemini-proxy</code>。
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-ink-900">和「教育心理」有什么关系？</h2>
        <ul className="text-sm text-ink-700 space-y-2 list-disc pl-5 leading-relaxed">
          <li>
            <strong>元认知监测</strong>：预测 + 信心 + 事后标签，对应「我是否知道自己会错在哪」。
          </li>
          <li>
            <strong>提取练习</strong>：闭卷限时写要点，比反复划线更能巩固长时记忆。
          </li>
          <li>
            <strong>间隔复习</strong>：按队列在遗忘临界附近再提取，减少考前突击负担。
          </li>
          <li>
            <strong>深度加工（读文献模式）</strong>：概括、预测、追问，逼自己留下可检验的思考痕迹。
          </li>
        </ul>
        <p className="text-xs text-ink-500">
          本工具不做诊断、不提供心理咨询；仅用于自我观察与学习策略实验。
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-semibold text-ink-900">推荐流程（按顺序点）</h2>
        <div className="space-y-4">
          {STEPS.map((s) => (
            <article
              key={s.title}
              className="card p-5 border-l-4 border-l-accent shadow-sm"
            >
              <h3 className="text-sm font-semibold text-ink-900 mb-2">
                {s.title}
              </h3>
              <p className="text-sm text-ink-700 whitespace-pre-line leading-relaxed">
                {s.body}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="card p-6 space-y-2">
        <h2 className="text-base font-semibold text-ink-900">两个「Today」模式怎么选？</h2>
        <ul className="text-sm text-ink-700 space-y-2 list-disc pl-5 leading-relaxed">
          <li>
            <strong>Concept / Course</strong>：复习课内概念、备考；可填预计/实际学习分钟数，看你是否总低估考试难度或时间。
          </li>
          <li>
            <strong>Reading / Paper</strong>：读完一章或一篇论文后；强调「用自己的话概括 + 可检验预测 + 追问」，方便申研、写
            research fit 时脑子里有货。
          </li>
        </ul>
      </section>

      <section className="card p-6 space-y-2">
        <h2 className="text-base font-semibold text-ink-900">三个导航页分别管什么？</h2>
        <dl className="text-sm text-ink-700 space-y-3">
          <div>
            <dt className="font-medium text-ink-900">Today</dt>
            <dd>新建一个学习单元，走完预测 → 闭卷回忆 → 对照打标签 → 保存。</dd>
          </div>
          <div>
            <dt className="font-medium text-ink-900">Recall queue</dt>
            <dd>到期的旧单元会出现在这里；做短回忆、标记通过与否，更新间隔。</dd>
          </div>
          <div>
            <dt className="font-medium text-ink-900">My biases</dt>
            <dd>看你一段时间内的标签分布、复习通过率、时间偏差；可导出 CSV。</dd>
          </div>
        </dl>
      </section>

      <div className="flex flex-wrap gap-3 justify-center pt-2">
        <button type="button" className="btn-primary px-6" onClick={onStart}>
          去 Today 开始第一个单元
        </button>
      </div>
    </div>
  );
}
