export const platformConfig = {
  domain: import.meta.env.VITE_PLATFORM_DOMAIN ?? 'vipdid.app',
  subdomainPattern: import.meta.env.VITE_SUBDOMAIN_PATTERN ?? '*.vipdid.app',
  names: {
    ar: 'الهوية الرقمية لكبار الشخصيات',
    en: 'VIP Digital ID'
  },
  ownership: {
    ar: 'شركة الهوية الرقمية',
    en: 'Digital id Company'
  },
  legal: {
    copyright: {
      ar: 'جميع الحقوق محفوظة لمنصة رجال السعودية KSA MEN',
      en: 'All rights reserved to KSA MEN platform'
    },
    privacyContact: 'vip.did.app@gmail.com'
  },
  contact: {
    ownerEmail: 'rijalalwatan.com@gmail.com',
    supportEmail: 'vip.did.app@gmail.com',
    whatsapp: '966555444959'
  },
  verification: {
    turnstileSiteKey: import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '0x4AAAAAAFwJhk7pp9aeFV4Y'
  },
  assets: {
    logo: '/brand/logo.webp',
    coverDark: '/brand/cover.webp',
    coverLight: '/brand/cover-light.webp'
  },
  palette: {
    gold: '#d8ae52',
    goldBright: '#f6d98f',
    charcoal: '#090b0e',
    ivory: '#f6f2e8'
  }
} as const;

export type PlatformLocale = keyof typeof platformConfig.names;
