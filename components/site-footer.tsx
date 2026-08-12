import Link from "next/link";
import { ICP_NUMBER, LEGAL_OPERATOR_NAME } from "@/lib/legal-profile";

export function SiteFooter() {
  const icpNumber = process.env.VAULT2077_ICP_NUMBER?.trim() || ICP_NUMBER;
  return (
    <footer className="site-footer">
      <div className="shell site-footer__grid">
        <Link className="footer-brand" href="/">VAULT2077</Link>
        <nav className="footer-nav" aria-label="页脚导航">
          <Link href="/about">关于</Link>
          <Link href="/methodology">方法说明</Link>
          <Link href="/sources">数据源地图</Link>
          <Link href="/corrections">纠错</Link>
          <Link href="/opc/refund">退款申请</Link>
          <Link href="/legal">经营者信息</Link>
          <Link href="/privacy">隐私</Link>
          <Link href="/terms">条款</Link>
        </nav>
        <div className="footer-meta mono">
          {icpNumber ? <p><a href="https://beian.miit.gov.cn/" rel="noreferrer">备案号：{icpNumber}</a></p> : null}
          <p>{LEGAL_OPERATOR_NAME}</p>
          <p>© 2026 VAULT2077</p>
        </div>
      </div>
    </footer>
  );
}
