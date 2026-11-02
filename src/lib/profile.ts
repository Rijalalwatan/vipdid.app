export type MediaCategory = 'avatar' | 'cover' | 'skill' | 'portfolio';

export type ProfileData = {
  displayName: string;
  title: string;
  bio: string;
  experiences: string;
  education: string;
  courses: string;
  skills: string;
  languages: string;
  achievements: string;
  awards: string;
  portfolio: string;
  services: string;
  socialLinks: string;
  videoUrl: string;
  externalLinks: string;
  showWhatsapp: boolean;
  showPhone: boolean;
  showEmail: boolean;
};

export type ProfileMedia = {
  id: string;
  category: MediaCategory;
  sizeBytes: number;
  url: string;
};

export type PublicationStatus = 'pending' | 'approved' | 'changes_requested' | 'rejected' | null;
export type PublicationState = { isPublished: boolean; latestStatus: PublicationStatus; latestRequestId: string | null; submittedAt: number | null; reviewNote: string | null };
export type PlatformNotification = { id: string; kind: 'publication_approved' | 'publication_changes_requested' | 'publication_rejected'; title: string; message: string; createdAt: number };
export type ReviewRequest = { id: string; slug: string; ownerName: string; ownerEmail: string; submittedAt: number; status: PublicationStatus; reviewNote: string | null; snapshot: { data: ProfileData; mediaIds: string[] }; submissionLocale: 'ar' | 'en' };

export type AccountProfile = {
  slug: string;
  data: ProfileData;
  media: ProfileMedia[];
  imageCount: number;
  storageUsedBytes: number;
  exists: boolean;
  contact: { email: string; phone: string; whatsapp: string };
  publication: PublicationState;
};

export const emptyProfile = (displayName = ''): ProfileData => ({
  displayName,
  title: '',
  bio: '',
  experiences: '',
  education: '',
  courses: '',
  skills: '',
  languages: '',
  achievements: '',
  awards: '',
  portfolio: '',
  services: '',
  socialLinks: '',
  videoUrl: '',
  externalLinks: '',
  showWhatsapp: false,
  showPhone: false,
  showEmail: false
});

export const mediaMaximums: Record<MediaCategory, number> = { avatar: 1, cover: 1, skill: 3, portfolio: 4 };
export const imageStorageLimit = 5 * 1024 * 1024;
export const profileSections = ['bio', 'experiences', 'skills', 'portfolio', 'contact', 'codes'] as const;
export type PublicSection = typeof profileSections[number];

export function readableBytes(bytes: number, locale: 'ar' | 'en') {
  const value = Math.max(0, bytes) / 1024 / 1024;
  return locale === 'ar' ? `${value.toFixed(value >= 1 ? 1 : 2)} ميغابايت` : `${value.toFixed(value >= 1 ? 1 : 2)} MB`;
}

export function publicUrl(slug: string) { return `https://vipdid.app/${slug}`; }
