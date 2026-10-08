/** Types shared by the Angular client and the Express server. */

export type Verdict = 'safe' | 'suspicious' | 'high';
export type ScanKind = 'url' | 'upi' | 'phone' | 'text' | 'qr' | 'email';

export interface Signal {
  /** machine id, e.g. "brand-impersonation" */
  id: string;
  label: string;
  /** how strongly it pushes towards scam (+) or safety (-), 0..1 */
  weight: number;
  kind: 'ml' | 'rule' | 'reputation' | 'community';
}

export interface FeatureContribution {
  feature: string;
  contribution: number;
}

export interface ModelInfo {
  name: string;
  version: string;
  probability: number;
  topFeatures: FeatureContribution[];
}

export interface ScanResponse {
  id: string;
  kind: ScanKind;
  input: string;
  verdict: Verdict;
  /** 0..100 */
  score: number;
  summary: string;
  reasons: string[];
  signals: Signal[];
  models: ModelInfo[];
  communityReports: number;
  blocked: boolean;
  recommendedActions: string[];
  extracted?: { urls: string[]; upi: string[]; phones: string[] };
  qrPayload?: string;
  generatedAt: string;
}

export interface ModelCard {
  name: string;
  version: string;
  algorithm: string;
  trainedOn: Record<string, number>;
  metrics: Record<string, unknown>;
  note?: string;
}

/* ------------------------------------------------------------------ e-mail forensics */
export interface MLFeatureWeight {
  phrase: string;
  weight: number;
}

export interface EmailForensicReport {
  caseId: string;
  generatedDate: string;
  threatScore: number;
  verdict: 'HIGH' | 'MEDIUM' | 'LOW';
  attributionLabel: string;
  attributionConfidence: number;
  campaignId: string;
  limitedForensicsMode: boolean;

  senderInfo: {
    from: string;
    fromDisplayName: string;
    fromDomain: string;
    returnPathDomain: string;
    subject: string;
    date: string;
  };

  authentication: {
    spf: 'pass' | 'fail' | 'softfail' | 'none';
    dkim: 'pass' | 'fail' | 'none';
    dmarc: 'pass' | 'fail' | 'none';
    returnPathMismatch: boolean;
  };

  networkIntelligence: {
    earliestPublicRelayIp: string;
    probableCountry: string;
    probableCity: string;
    ispOrg: string;
    locationDisclaimer: string;
    torExitNode: boolean;
    knownVpnProvider: boolean;
    genericCloudHosting: boolean;
  };

  domainWhois: {
    registrar: string;
    creationDate: string;
    domainAgeDays: number | string;
  };

  relayPath: { hopNumber: number; from: string; by: string; ip: string }[];
  scoringRationale: string[];

  machineLearningAssessment: {
    modelName: string;
    summary: string;
    topPhrases: MLFeatureWeight[];
  };

  linkAnalysis: { url: string; verdict: Verdict; score: number }[];

  recommendedActions: { riskTitle: string; items: string[] };
  evidenceIntegrity: { sha256: string };
  attributionLimitations: string;
}

export interface EmailInput {
  id?: string;
  /** raw RFC-822 message or just its header block (preferred) */
  raw?: string;
  /** alternative to raw: parsed headers (e.g. from the Gmail API) */
  headers?: { name: string; value: string }[];
  from?: string;
  subject?: string;
  body?: string;
  snippet?: string;
}

export interface EmailBatchItem {
  id: string;
  sender: string;
  subject: string;
  date: string;
  snippet: string;
  verdict: 'HIGH' | 'MEDIUM' | 'LOW';
  score: number;
  category: string;
  reasons: string[];
  links: string[];
  recommendedAction: string;
}

/* ------------------------------------------------------------------ community */
export interface PostComment {
  id: string;
  authorId: string;
  author: string;
  avatar: string;
  text: string;
  createdAt: string;
}

export interface CommunityPostDto {
  id: string;
  authorId: string;
  authorName: string;
  authorHeadline: string;
  authorAvatar: string;
  verified: boolean;
  createdAt: string;
  content: string;
  mediaType?: 'image' | 'video';
  mediaUrl?: string;
  videoTitle?: string;
  tags: string[];
  likes: number;
  likedByMe: boolean;
  comments: PostComment[];
  mine: boolean;
}

export interface EntityReportDto {
  kind: ScanKind;
  value: string;
  note?: string;
}
