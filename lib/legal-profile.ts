export const LEGAL_OPERATOR_NAME = "上海睿诚明达咨询管理有限公司";
export const LEGAL_OPERATOR_TYPE = "有限责任公司";
export const LEGAL_OPERATOR_LOCATION = "上海市";
export const LEGAL_OPERATOR_CREDIT_CODE = "91310000MAC3G0M33G";
export const LEGAL_OPERATOR_REGISTERED_ADDRESS = "中国（上海）自由贸易试验区临港新片区环湖西二路888号C楼";
export const LEGAL_OPERATOR_LEGAL_REPRESENTATIVE = "胡丛蕊";
export const LEGAL_OPERATOR_REGISTERED_CAPITAL = "50万元人民币";
export const LEGAL_CONTACT_EMAIL = "lanzhouda@tsinglaw.com";
export const LEGAL_EFFECTIVE_DATE = "2026-08-01";
export const PUBLIC_DOMAIN = "superones.top";
export const PUBLIC_ORIGIN = `https://${PUBLIC_DOMAIN}`;
export const ADMIN_ORIGIN = `https://admin.${PUBLIC_DOMAIN}`;
export const ICP_NUMBER = "沪ICP备2026003401号-1";

export function getLegalProfile(
  environment: Record<string, string | undefined> = process.env,
) {
  const legalContactEmail = environment.VAULT2077_LEGAL_CONTACT_EMAIL?.trim()
    || LEGAL_CONTACT_EMAIL;
  return {
    operatorName: LEGAL_OPERATOR_NAME,
    operatorType: LEGAL_OPERATOR_TYPE,
    operatorLocation: LEGAL_OPERATOR_LOCATION,
    publicDomain: PUBLIC_DOMAIN,
    publicOrigin: PUBLIC_ORIGIN,
    icpNumber: ICP_NUMBER,
    unifiedSocialCreditCode: environment.VAULT2077_OPERATOR_CREDIT_CODE?.trim()
      || LEGAL_OPERATOR_CREDIT_CODE,
    registeredAddress: environment.VAULT2077_OPERATOR_REGISTERED_ADDRESS?.trim()
      || LEGAL_OPERATOR_REGISTERED_ADDRESS,
    legalRepresentative: environment.VAULT2077_OPERATOR_LEGAL_REPRESENTATIVE?.trim()
      || LEGAL_OPERATOR_LEGAL_REPRESENTATIVE,
    registeredCapital: environment.VAULT2077_OPERATOR_REGISTERED_CAPITAL?.trim()
      || LEGAL_OPERATOR_REGISTERED_CAPITAL,
    legalContactEmail,
    customerServiceEmail: environment.VAULT2077_CUSTOMER_SERVICE_EMAIL?.trim()
      || legalContactEmail,
    effectiveDate: environment.VAULT2077_LEGAL_EFFECTIVE_DATE?.trim()
      || LEGAL_EFFECTIVE_DATE,
  };
}
