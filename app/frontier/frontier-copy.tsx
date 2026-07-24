export function ManifestoContent() {
  return (
    <div className="manifesto-copy">
      <p>致 <strong>站在边境线上的你</strong>：</p>
      <p>边境是一堵虚构的墙，它只存在于我们意识当中。</p>
      <p>我们一直被这个世界告知，边境之外，是 <strong>【不能】</strong>。</p>
      <p>于是，我们一切的努力、奋斗、幻想，全都被边界阻挡。每当你想要创造什么，一旦碰触那道边界，一个声音就会在脑海中响起：<strong>你不行</strong>。</p>
      <p>你没有技能、你没有经验、你没有人脉、你没有资本——你不行。</p>
      <p>现在，这堵墙终于要倒下了。</p>
      <p>AI 带来的地震，震碎了一切有形无形的高墙。我们甚至可以从墙缝里看到远方的风景。</p>
      <p className="manifesto-copy__signal">我有一件想做很久的事！</p>
      <p>现在不出发，还要等到什么时候？</p>
      <p>边境计划旨在为每一位试图跨过边境的穿越者点燃一盏灯：<strong>此处，可以通行</strong>。</p>
      <p>如果你厌倦了被定义、被评估、被拒绝——</p>
      <p>如果你相信想法比简历更重要、行动比计划更珍贵——</p>
      <p>如果你准备好踏入未知，在荒野中建立自己的营地——</p>
      <p>欢迎你，<strong>穿越者</strong>。这里没有观众，只有同行之人。</p>
    </div>
  );
}

export function RulesContent() {
  return (
    <ol className="frontier-rules-list">
      <li><strong>四无</strong><span>边境计划无期限、无评审、无组织、无目标。</span></li>
      <li><strong>仓库资格</strong><span>仓库必须公开、非纯 Fork、未归档，并具有 GitHub 可识别的开源许可证。</span></li>
      <li><strong>挑战文件</strong><span>验证文件必须保留在默认分支直到赛季结算；网站在报名和结算时各检查一次。</span></li>
      <li><strong>排名</strong><span>验证成功时记录 Star 基线，之后按净新增 Star 排名，每小时更新。</span></li>
      <li><strong>季度结算</strong><span>一次报名只参加最近一次季度结算；结算时重新检查全部机器资格。</span></li>
      <li><strong>奖励</strong><span>冠军获得官方奖励；所有有效报名按最终排名顺序，各随机获得至多一件匿名奖品。</span></li>
      <li><strong>再次报名</strong><span>季度冠军仓库永久退出；其他仓库下季可以重新报名。</span></li>
      <li><strong>隐私</strong><span>Email 只用于与报名和奖品相关的必要联系，不会公开展示。</span></li>
    </ol>
  );
}

export function DonationNotice() {
  return (
    <div className="donation-notice-copy">
      <p>提交即表示你自愿将所述奖品加入边境计划匿名随机奖池，并确认奖品真实存在、说明真实准确。</p>
      <p>奖品被分配后，你同意无偿向获得该奖品的穿越者转移奖品所有权或相应使用权，并通过提交的 Email 完成必要联系与交付。</p>
      <p>你的身份和联系方式不会在公开奖池中展示。奖品提交后须经确认才会公开；在随机分配完成前可以申请撤回，分配完成后不得附加宣传、付费或其他交付条件。</p>
    </div>
  );
}
