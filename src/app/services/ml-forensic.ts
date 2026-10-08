import { Injectable, inject } from '@angular/core';
import { ApiService } from './api';
import type { EmailForensicReport, EmailInput, ModelCard } from '../../shared/api-types';

export type { EmailForensicReport, MLFeatureWeight } from '../../shared/api-types';

/** Thin client: all analysis runs on the server (real trained models + live lookups). */
@Injectable({ providedIn: 'root' })
export class MLForensicService {
  private api = inject(ApiService);

  async analyzeEmail(input: EmailInput, deep = true): Promise<EmailForensicReport> {
    const res = await this.api.post<{ report: EmailForensicReport }>('/scan/email', { ...input, deep });
    return res.report;
  }

  async samples(): Promise<{ id: string; label: string; raw: string }[]> {
    return (await this.api.get<{ samples: { id: string; label: string; raw: string }[] }>('/samples/emails')).samples;
  }

  async modelCards(): Promise<ModelCard[]> {
    return (await this.api.get<{ models: ModelCard[] }>('/ml/models')).models;
  }
}
