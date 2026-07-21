import type { Metadata } from "next";
import { PageIntro } from "@/components/page-intro";
import { ServiceList } from "@/components/service-list";
import { services } from "@/lib/data";

export const metadata: Metadata = { title: "OPC 服务台" };

export default function OpcPage() {
  return (
    <>
      <PageIntro code="OPC / SERVICE DESK" title="把中后台，变成可以直接选择的服务。" lead="明确范围、固定价格、材料清单和交付周期。由 Vault2077 内部专业人员直接交付。" meta="DEMO MENU / 正式上线前由专业负责人确认" />
      <section className="shell content-section">
        <div className="notice-line mono"><span>当前为示例服务菜单</span><span>网站展示 / 线下付款 / 专业团队交付</span></div>
        <ServiceList items={services} />
      </section>
      <section className="contact-section" id="contact">
        <div className="shell contact-grid">
          <div>
            <p className="eyebrow mono">OPC / CONTACT</p>
            <h2>先确认边界，<br />再开始服务。</h2>
          </div>
          <div className="contact-copy">
            <p>扫描统一工作人员二维码，发送你希望购买的服务名称。工作人员会确认是否符合标准服务范围，再安排付款与交付。</p>
            <div className="qr-placeholder mono" role="img" aria-label="工作人员二维码待接入">
              <span>QR PLACEHOLDER</span>
              <strong>正式二维码待接入</strong>
              <span>工作人员账号：待提供</span>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
