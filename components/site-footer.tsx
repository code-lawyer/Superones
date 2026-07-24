import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell site-footer__grid">
        <Link className="footer-brand" href="/">VAULT2077</Link>
        <nav className="footer-nav" aria-label="页脚导航">
          <Link href="/about">关于</Link>
          <Link href="/methodology">方法说明</Link>
          <Link href="/sources">数据源地图</Link>
          <Link href="/corrections">纠错</Link>
          <Link href="/privacy">隐私</Link>
          <Link href="/terms">条款</Link>
        </nav>
        <div className="footer-meta mono">
          <p>ICP备案信息待接入</p>
          <p>© 2026 VAULT2077</p>
        </div>
      </div>
    </footer>
  );
}
