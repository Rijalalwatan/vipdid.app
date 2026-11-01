export type Locale = 'ar' | 'en';

export const content = {
  ar: {
    documentTitle: 'الهوية الرقمية لكبار الشخصيات',
    languageAction: 'تغيير اللغة',
    lockEyebrow: 'وصول خاص',
    lockTitle: 'الهوية الرقمية لكبار الشخصيات',
    lockDescription: 'منصة مخصصة لحضور رقمي يليق بأصحاب المكانة.',
    passwordLabel: 'رمز الدخول',
    passwordPlaceholder: 'أدخل رمز الدخول',
    unlock: 'دخول آمن',
    invalidPassword: 'تعذر التحقق من رمز الدخول. تأكد من الرمز ثم أعد المحاولة.',
    unavailable: 'الخدمة غير متاحة مؤقتاً. يرجى المحاولة لاحقاً.',
    protected: 'منصة محمية',
    support: 'التواصل مع الإدارة',
    owner: 'الملكية والتشغيل',
    welcomeEyebrow: 'هوية تليق بالمكانة',
    welcomeTitle: 'حضورك الرقمي، بتوقيع استثنائي.',
    welcomeDescription: 'مساحة هوية خاصة، صُممت لتُظهر التفاصيل التي تستحق أن تُرى.',
    explore: 'استكشاف المنصة',
    privacy: 'خصوصية راسخة',
    refinement: 'تفاصيل راقية',
    permanence: 'هوية دائمة',
    copyright: 'جميع الحقوق محفوظة'
  },
  en: {
    documentTitle: 'VIP Digital ID',
    languageAction: 'Change language',
    lockEyebrow: 'Private Access',
    lockTitle: 'VIP Digital ID',
    lockDescription: 'A private platform for a presence worthy of distinction.',
    passwordLabel: 'Access code',
    passwordPlaceholder: 'Enter access code',
    unlock: 'Enter Securely',
    invalidPassword: 'The access code could not be verified. Please try again.',
    unavailable: 'The service is temporarily unavailable. Please try again later.',
    protected: 'Protected platform',
    support: 'Contact the administration',
    owner: 'Owned and operated by',
    welcomeEyebrow: 'Identity with distinction',
    welcomeTitle: 'Your digital presence, exceptionally signed.',
    welcomeDescription: 'A private identity space designed to elevate what deserves to be seen.',
    explore: 'Explore the platform',
    privacy: 'Rooted privacy',
    refinement: 'Refined detail',
    permanence: 'Lasting identity',
    copyright: 'All rights reserved'
  }
} as const;

export type Copy = Record<keyof typeof content.ar, string>;
