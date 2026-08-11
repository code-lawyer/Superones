from __future__ import annotations

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "OPC-服务订单及线下对公转账协议-v1.pdf"
FONT_REGULAR = Path(r"C:\Windows\Fonts\msyh.ttc")
FONT_BOLD = Path(r"C:\Windows\Fonts\msyhbd.ttc")

INK = colors.HexColor("#11120F")
PAPER = colors.HexColor("#F5F3EC")
MUTED = colors.HexColor("#67685F")
RULE = colors.HexColor("#C9C6BA")
ACCENT = colors.HexColor("#B96B3E")


def register_fonts() -> None:
    pdfmetrics.registerFont(TTFont("MicrosoftYaHei", str(FONT_REGULAR)))
    pdfmetrics.registerFont(TTFont("MicrosoftYaHeiBold", str(FONT_BOLD)))


def header_footer(canvas, doc) -> None:
    canvas.saveState()
    width, height = A4
    canvas.setFillColor(PAPER)
    canvas.rect(0, 0, width, height, stroke=0, fill=1)
    canvas.setStrokeColor(RULE)
    canvas.setLineWidth(0.5)
    canvas.line(22 * mm, height - 17 * mm, width - 22 * mm, height - 17 * mm)
    canvas.setFont("MicrosoftYaHeiBold", 7.4)
    canvas.setFillColor(INK)
    canvas.drawString(22 * mm, height - 13 * mm, "SUPERONES / OPC")
    canvas.setFont("MicrosoftYaHei", 7.2)
    canvas.setFillColor(MUTED)
    canvas.drawRightString(width - 22 * mm, height - 13 * mm, "服务订单及线下对公转账协议 · 正式版 v1")
    canvas.line(22 * mm, 15 * mm, width - 22 * mm, 15 * mm)
    canvas.drawString(22 * mm, 9.5 * mm, "上海睿诚明达咨询管理有限公司")
    canvas.drawRightString(width - 22 * mm, 9.5 * mm, f"{doc.page}")
    canvas.restoreState()


def build_styles():
    styles = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "TitleCN", parent=styles["Title"], fontName="MicrosoftYaHeiBold",
            fontSize=25, leading=34, textColor=INK, alignment=TA_LEFT, spaceAfter=10 * mm,
        ),
        "kicker": ParagraphStyle(
            "Kicker", fontName="MicrosoftYaHeiBold", fontSize=7.5, leading=10,
            textColor=ACCENT, spaceAfter=5 * mm, uppercase=True,
        ),
        "subtitle": ParagraphStyle(
            "Subtitle", fontName="MicrosoftYaHei", fontSize=9, leading=16,
            textColor=MUTED, spaceAfter=8 * mm,
        ),
        "h1": ParagraphStyle(
            "H1CN", fontName="MicrosoftYaHeiBold", fontSize=14, leading=22,
            textColor=INK, spaceBefore=6 * mm, spaceAfter=3 * mm,
        ),
        "h2": ParagraphStyle(
            "H2CN", fontName="MicrosoftYaHeiBold", fontSize=10, leading=17,
            textColor=INK, spaceBefore=3 * mm, spaceAfter=1.5 * mm,
        ),
        "body": ParagraphStyle(
            "BodyCN", fontName="MicrosoftYaHei", fontSize=8.8, leading=16,
            textColor=INK, alignment=TA_JUSTIFY, spaceAfter=2.5 * mm,
            wordWrap="CJK",
        ),
        "small": ParagraphStyle(
            "SmallCN", fontName="MicrosoftYaHei", fontSize=7.5, leading=13,
            textColor=MUTED, wordWrap="CJK",
        ),
        "note": ParagraphStyle(
            "NoteCN", fontName="MicrosoftYaHei", fontSize=8.3, leading=15,
            textColor=INK, leftIndent=5 * mm, rightIndent=5 * mm,
            borderColor=RULE, borderWidth=0.6, borderPadding=4 * mm,
            backColor=colors.HexColor("#ECE9E0"), spaceBefore=3 * mm, spaceAfter=5 * mm,
            wordWrap="CJK",
        ),
        "table_label": ParagraphStyle(
            "TableLabel", fontName="MicrosoftYaHeiBold", fontSize=7.5, leading=12, textColor=MUTED,
        ),
        "table_value": ParagraphStyle(
            "TableValue", fontName="MicrosoftYaHei", fontSize=8.2, leading=13, textColor=INK, wordWrap="CJK",
        ),
        "center": ParagraphStyle(
            "CenterCN", fontName="MicrosoftYaHei", fontSize=8, leading=14, textColor=MUTED, alignment=TA_CENTER,
        ),
    }


def p(text: str, style) -> Paragraph:
    return Paragraph(text, style)


def section(number: str, title: str, paragraphs: list[str], styles):
    items = [p(f"{number}　{title}", styles["h1"])]
    for paragraph in paragraphs:
        items.append(p(paragraph, styles["body"]))
    return items


def build_pdf() -> None:
    register_fonts()
    styles = build_styles()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc = BaseDocTemplate(
        str(OUTPUT), pagesize=A4,
        rightMargin=22 * mm, leftMargin=22 * mm,
        topMargin=23 * mm, bottomMargin=21 * mm,
        title="OPC 服务订单及线下对公转账协议 v1",
        author="上海睿诚明达咨询管理有限公司",
        subject="OPC 线下对公转账服务订单协议正式版",
    )
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="main", showBoundary=0)
    doc.addPageTemplates([PageTemplate(id="agreement", frames=[frame], onPage=header_footer)])

    story = [
        Spacer(1, 17 * mm),
        p("ORDER & BANK TRANSFER", styles["kicker"]),
        p("服务订单及<br/>线下对公转账协议", styles["title"]),
        p("适用于 SUPERONES 网站 OPC 服务的线下付款订单。协议版本：opc-offline-bank-transfer-v1。", styles["subtitle"]),
    ]

    party_data = [
        [p("服务方", styles["table_label"]), p("上海睿诚明达咨询管理有限公司", styles["table_value"])],
        [p("统一社会信用代码", styles["table_label"]), p("91310000MAC3G0M33G", styles["table_value"])],
        [p("注册地址", styles["table_label"]), p("中国（上海）自由贸易试验区临港新片区环湖西二路888号C楼", styles["table_value"])],
        [p("网站与备案", styles["table_label"]), p("https://superones.top　｜　沪ICP备2026003401号-1", styles["table_value"])],
        [p("联系邮箱", styles["table_label"]), p("lanzhouda@tsinglaw.com", styles["table_value"])],
        [p("用户／委托方", styles["table_label"]), p("以用户在订单页面提交并经系统留存的信息为准", styles["table_value"])],
    ]
    table = Table(party_data, colWidths=[35 * mm, 108 * mm], hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#ECE9E0")),
        ("BOX", (0, 0), (-1, -1), 0.6, RULE),
        ("INNERGRID", (0, 0), (-1, -1), 0.35, RULE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 3.5 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3.5 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 3 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3 * mm),
    ]))
    story.extend([
        table,
        Spacer(1, 7 * mm),
        p("重要提示", styles["h2"]),
        p(
            "本文件是当前正式发布的通用服务协议，用于约定线下对公转账订单的共同规则，不等同于付款凭证。"
            "每笔交易的服务项目、金额、订单号、付款附言和当期收款账户，以用户提交订单时同页展示并由系统留存的订单快照为准。"
            "用户应在转账前核对户名、账号、金额和订单号；如有疑问，可在转账前扫描同页联系人二维码沟通确认。",
            styles["note"],
        ),
        PageBreak(),
    ])

    story += section("一", "适用范围与文件组成", [
        "1.1　本协议适用于用户通过 SUPERONES 网站选择 OPC 服务并采用线下对公转账方式付款的订单。服务方与用户合称“双方”。",
        "1.2　每笔订单由本协议、订单页面展示并留存的具体服务项目、金额、订单号、付款附言、企业收款信息，以及双方后续就服务范围形成的可核验书面确认共同组成。内容冲突时，具体订单的特别约定优先于本协议的一般约定；双方另行明确变更的，以较新的书面确认优先。",
        "1.3　用户可在下单前完整查看并下载本协议。用户勾选同意并提交订单，即表示已阅读、理解并同意本协议，双方就该订单形成合同关系；服务启动仍以服务方完成到账核验及必要的项目确认作为履行条件。",
    ], styles)
    story += section("二", "服务内容与交付", [
        "2.1　具体服务名称、价格、数量或服务周期，以订单页面为准。服务方不因用户完成转账而当然承担订单范围以外的额外工作。",
        "2.2　到账核验后，双方可通过订单页联系人或其他留痕方式确认项目资料、服务边界、计划和交付安排。需要用户提供材料、授权、反馈或配合的，相关期限自用户完成必要配合之日起计算。",
        "2.3　服务方应按照订单约定和法律法规提供服务。用户应保证其提交的信息、材料和指令真实、合法且有权使用，并不得要求服务方从事违法违规活动。",
    ], styles)
    story += section("三", "同页付款信息与沟通", [
        "3.1　线下付款页同时展示企业收款账户、本协议入口和联系人二维码。用户无需先转账再添加联系人，可在转账前自行扫码沟通确认。联系人二维码仅用于业务沟通，不改变订单中的合同主体和收款主体。",
        "3.2　服务方仅要求用户向订单页所示、户名为“上海睿诚明达咨询管理有限公司”的企业银行账户付款。若任何人要求付款至个人账户、非订单页账户或通过无法核验的方式付款，用户应暂停付款并通过网站公开渠道复核。",
        "3.3　用户应自行核对收款户名、开户银行、账号、订单金额和付款附言。因用户未核对而向错误账户付款的，服务方将在合理范围内协助，但不把未实际入账的款项视为已收款。",
    ], styles)
    story += section("四", "转账、附言与到账认定", [
        "4.1　用户应按订单固定金额付款，并在银行转账附言中填写订单页面生成的订单号或付款附言。付款账户宜与用户或其经确认的付款主体一致。",
        "4.2　服务方以企业银行账户的实际入账记录为到账认定的核心依据，并结合订单号、金额、付款户名、银行流水号和入账时间匹配订单。转账截图、回单图片或用户单方陈述可用于协助查找，但不单独构成最终到账证据。",
        "4.3　银行处理存在延迟时，订单可暂处于“待核验”状态。服务方完成匹配后更新订单状态并推进下一步；用户可提供不含敏感认证信息的银行回单协助核验。",
        "4.4　用户不得提交伪造、篡改或重复使用的付款材料。由此产生的损失、调查成本或法律责任由责任方承担。",
    ], styles)
    story.append(PageBreak())
    story += section("五", "异常付款处理", [
        "5.1　少付、超付、分笔付款、未填写订单号、由第三方账户付款或多笔订单金额相同，均可能导致自动或人工匹配延迟。双方应通过留痕沟通补充订单号、付款户名、金额、日期和银行流水号。",
        "5.2　超付款项经核实后，可由双方协商用于追加服务或原路／原付款账户退回；少付款项在补足前，服务方可暂缓启动服务。任何处理均不得改变资金真实流向和审计记录。",
        "5.3　无法确认对应订单或存在欺诈、洗钱、制裁、盗用账户等风险迹象时，服务方可暂停履行，要求补充材料，并依法向银行、支付机构或有权机关报告或配合调查。",
    ], styles)
    story += section("六", "取消、退款与终止", [
        "6.1　用户付款前可不继续转账，并可通过同页联系人申请取消未付款订单。订单成立后但尚未付款，不影响双方已形成的记录留存和必要风险审查；取消后的非必要联系方式按网站隐私政策处理。",
        "6.2　付款后的取消与退款，应结合服务是否启动、已完成工作、已发生的不可退成本和双方约定处理。法律法规或另行公示规则对退款有强制要求的，从其规定。",
        "6.3　获准退款时，原则上退回原付款账户或与原付款主体同名且经核验的企业／个人账户。服务方应留存退款申请、审批、银行流水和状态变更记录。用户要求退至无关第三方账户的，服务方有权拒绝。",
        "6.4　一方严重违约、违法使用服务或持续拒绝必要配合的，守约方可依法解除或终止订单，并要求责任方承担相应责任。",
    ], styles)
    story += section("七", "发票、税费与费用", [
        "7.1　用户需要发票的，应提供合法、准确的开票信息。开票内容、税率和时间按实际交易性质、适用税法及服务方开票流程办理。",
        "7.2　银行收取的转账手续费由收取该费用的一方按其与银行的约定承担；因用户选择境外汇款、中间行或特殊通道产生的额外费用，应由双方事先确认。",
    ], styles)
    story += section("八", "数据、隐私与记录", [
        "8.1　服务方为下单、沟通、到账核验、履约、开票、退款、争议处理、安全和合规目的，处理必要的联系方式、订单信息、付款主体信息及银行交易标识。具体处理遵循网站公示的隐私政策和适用法律。",
        "8.2　双方应妥善保管银行账户、验证码、登录凭证和其他敏感信息。服务方不会通过联系人二维码索要银行密码、短信验证码或远程控制权限。",
        "8.3　服务方依法留存订单、协议版本、账户资料版本、付款核验和状态变更记录。用户可下载本协议；具体订单记录以系统及依法保存的业务、财务记录为准。",
    ], styles)
    story.append(PageBreak())
    story += section("九", "知识产权与保密", [
        "9.1　双方在合作前已拥有的商标、内容、数据、方法、软件和其他成果，其权利仍归原权利人。具体交付成果的使用范围按订单或双方书面确认执行。",
        "9.2　一方因履约知悉的对方非公开商业、技术或个人信息，应仅为本订单目的使用，并采取合理保护措施；法律要求披露或信息已合法公开的除外。",
    ], styles)
    story += section("十", "责任限制与不可抗力", [
        "10.1　任何一方违反本协议造成对方损失的，应在法律允许范围内承担与其过错和可预见损失相匹配的责任。对故意、重大过失、人身损害、欺诈或法律不得限制的责任，不适用不当免责。",
        "10.2　因不可抗力或无法合理控制的银行系统故障、公共网络中断、监管措施等导致延迟的，受影响方应及时通知并采取合理减损措施；双方根据影响程度协商延期、变更或终止。",
    ], styles)
    story += section("十一", "通知、变更与争议解决", [
        "11.1　与订单有关的通知可通过订单页面、用户提交的电子邮箱、同页联系人或双方确认的其他方式发送。涉及金额、服务范围、退款账户或合同主体的变更，应形成可核验的书面记录。",
        "11.2　服务方可为未来订单更新协议，但不得以新版本单方改变已成立订单的实质权利义务；已成立订单适用其提交时留存的协议版本，双方另有明确约定除外。",
        "11.3　本协议适用中华人民共和国法律。争议应先友好协商；协商不成的，任何一方可依法向有管辖权的人民法院提起诉讼。",
    ], styles)
    story += section("十二", "其他", [
        "12.1　本协议部分条款无效或不可执行，不影响其他条款效力。标题仅为阅读便利，不影响条款解释。",
        "12.2　协议以中文为准。订单页面保存的协议版本标识、提交时间和订单信息用于识别具体交易。",
    ], styles)
    story.extend([
        Spacer(1, 6 * mm),
        p("订单专属信息", styles["h1"]),
        p("本通用 PDF 不预填银行账号和订单金额，防止静态文件过期或与具体订单混用。以下字段以用户提交订单时同页展示并由系统留存的快照为准。", styles["note"]),
    ])

    snapshot_data = [
        [p("订单号", styles["table_label"]), p("以订单页面为准", styles["table_value"])],
        [p("服务与金额", styles["table_label"]), p("以订单页面固定金额为准", styles["table_value"])],
        [p("企业收款账户", styles["table_label"]), p("以订单页面当期发布的企业账户快照为准", styles["table_value"])],
        [p("付款附言", styles["table_label"]), p("以订单页面生成内容为准", styles["table_value"])],
        [p("协议版本", styles["table_label"]), p("opc-offline-bank-transfer-v1", styles["table_value"])],
    ]
    snapshot_table = Table(snapshot_data, colWidths=[35 * mm, 108 * mm], hAlign="LEFT")
    snapshot_table.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.6, RULE),
        ("INNERGRID", (0, 0), (-1, -1), 0.35, RULE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 3.5 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3.5 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 3 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3 * mm),
    ]))
    story.extend([
        KeepTogether([snapshot_table, Spacer(1, 7 * mm)]),
        p("本协议正式版发布日期：2026-08-11。项目负责人已结合实际服务内容、退款政策、开票流程和法律意见完成审阅并批准上线；后续替换 PDF 时，系统将以新修订号发布，既有订单仍保留原版本识别信息。", styles["small"]),
    ])

    doc.build(story)
    print("OPC offline agreement PDF generated.")


if __name__ == "__main__":
    build_pdf()
