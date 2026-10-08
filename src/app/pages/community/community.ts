import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
  computed,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../services/auth';
import { ApiService } from '../../services/api';
import { QuizComponent } from '../../components/quiz/quiz';
import type { CommunityPostDto } from '../../../shared/api-types';

type CommunityPost = CommunityPostDto;

@Component({
  selector: 'app-community',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, QuizComponent],
  template: `
    <div class="mx-auto max-w-7xl px-4 py-8">
      <!-- Top Banner -->
      <div class="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <div class="flex items-center gap-2 text-shield font-bold text-xs uppercase tracking-wider">
            <mat-icon class="!w-4 !h-4 !text-[16px]">groups</mat-icon>
            <span>CyberAid Professional Network</span>
          </div>
          <h1 class="text-2xl md:text-3xl font-extrabold text-foreground">
            Cybercrime Incident & Experience Feed
          </h1>
          <p class="text-xs md:text-sm text-muted-foreground mt-0.5">
            Share victim experiences, video testimonials, forensic evidence, and peer recovery strategies.
          </p>
        </div>

        <div class="flex items-center gap-2">
          <span class="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-bold text-accent-foreground">
            <span class="h-2 w-2 rounded-full bg-shield animate-pulse"></span>
            <span>Live Incident Stream</span>
          </span>
          <a
            href="tel:1930"
            class="flex items-center gap-1 rounded-xl bg-danger px-3.5 py-1.5 text-xs font-bold text-danger-foreground shadow-xs hover:opacity-90"
          >
            <mat-icon class="!w-4 !h-4 !text-[16px]">phone</mat-icon>
            <span>Helpline 1930</span>
          </a>
        </div>
      </div>

      <!-- 3-Column LinkedIn Layout -->
      <div class="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <!-- LEFT COLUMN: Profile Card & Shortcuts (3 cols) -->
        <aside class="space-y-4 lg:col-span-3">
          <!-- User Profile Card -->
          <div class="shadow-card overflow-hidden rounded-2xl border border-border bg-card">
            <div class="h-16 bg-gradient-to-r from-navy to-primary/40 relative"></div>
            <div class="p-4 pt-0 text-center relative -mt-8">
              <img
                [src]="userAvatar()"
                alt="Profile avatar"
                class="mx-auto h-16 w-16 rounded-full border-4 border-card bg-card object-cover shadow-sm"
              />
              <h2 class="mt-2 font-display text-base font-bold text-foreground truncate">
                {{ userName() }}
              </h2>
              <p class="text-xs text-muted-foreground line-clamp-2 px-1 mt-0.5">
                {{ userHeadline() }}
              </p>

              <div class="mt-4 border-t border-border pt-3 grid grid-cols-2 text-center text-xs">
                <div>
                  <p class="font-bold text-foreground">{{ myPostsCount() }}</p>
                  <p class="text-muted-foreground text-[11px]">Incidents</p>
                </div>
                <div>
                  <p class="font-bold text-shield">100%</p>
                  <p class="text-muted-foreground text-[11px]">Verified</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Quick Navigation & Project Info -->
          <div class="shadow-card rounded-2xl border border-border bg-card p-4 space-y-3 text-xs">
            <p class="font-bold uppercase tracking-wider text-muted-foreground">Topics & Focus</p>
            <div class="space-y-1 text-foreground/90 font-medium">
              <button
                type="button"
                (click)="filterCategory.set('all')"
                class="flex w-full items-center justify-between p-1.5 rounded-lg hover:bg-muted transition-colors"
                [class.text-shield]="filterCategory() === 'all'"
              >
                <span class="flex items-center gap-2">
                  <mat-icon class="!w-4 !h-4 !text-[16px]">dynamic_feed</mat-icon>
                  All Incident Posts
                </span>
                <span class="font-bold">{{ posts().length }}</span>
              </button>

              <button
                type="button"
                (click)="filterCategory.set('video')"
                class="flex w-full items-center justify-between p-1.5 rounded-lg hover:bg-muted transition-colors"
                [class.text-shield]="filterCategory() === 'video'"
              >
                <span class="flex items-center gap-2">
                  <mat-icon class="!w-4 !h-4 !text-[16px] text-danger">smart_display</mat-icon>
                  Video Testimonials
                </span>
                <span class="font-bold">
                  {{ videoCount() }}
                </span>
              </button>

              <button
                type="button"
                (click)="filterCategory.set('image')"
                class="flex w-full items-center justify-between p-1.5 rounded-lg hover:bg-muted transition-colors"
                [class.text-shield]="filterCategory() === 'image'"
              >
                <span class="flex items-center gap-2">
                  <mat-icon class="!w-4 !h-4 !text-[16px] text-primary">image</mat-icon>
                  Evidence Screenshots
                </span>
                <span class="font-bold">
                  {{ imageCount() }}
                </span>
              </button>
            </div>

            <!-- College Project Attribution -->
            <div class="mt-4 pt-3 border-t border-border text-[11px] text-muted-foreground">
              <p class="font-bold text-foreground">PRPCEM CSE Mini Project</p>
              <p class="mt-0.5">Guide: Prof. S. S. Ahmad</p>
              <p>Team: Harsh, Krishna, Krushna More, Jaffar, Meghesh, Nilesh & team</p>
            </div>
          </div>
        </aside>

        <!-- CENTER COLUMN: Feed & Creator Box (6 cols) -->
        <main class="space-y-5 lg:col-span-6">
          <!-- Start a Post Box (LinkedIn-Style) -->
          <div class="shadow-card rounded-2xl border border-border bg-card p-4 transition-all">
            <div class="flex items-center gap-3">
              <img
                [src]="userAvatar()"
                alt="Your avatar"
                class="h-10 w-10 rounded-full border border-border bg-muted object-cover"
              />
              <button
                type="button"
                (click)="showPostModal.set(true)"
                class="flex-1 rounded-full border border-border bg-muted/60 px-4 py-2.5 text-left text-xs md:text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
              >
                Share a cyber scam incident, video testimonial, or evidence…
              </button>
            </div>

            <!-- Quick Action Buttons -->
            <div class="mt-3 flex items-center justify-between border-t border-border/70 pt-2 text-xs">
              <button
                type="button"
                (click)="openModalWithMedia('image')"
                class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <mat-icon class="!w-5 !h-5 !text-[20px] text-primary">photo</mat-icon>
                <span class="font-medium">Evidence Photo</span>
              </button>

              <button
                type="button"
                (click)="openModalWithMedia('video')"
                class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <mat-icon class="!w-5 !h-5 !text-[20px] text-danger">smart_display</mat-icon>
                <span class="font-medium">Video Testimonial</span>
              </button>

              <button
                type="button"
                (click)="showPostModal.set(true)"
                class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <mat-icon class="!w-5 !h-5 !text-[20px] text-warning">article</mat-icon>
                <span class="font-medium">Threat Advisory</span>
              </button>
            </div>
          </div>

          <!-- Feed Posts List -->
          @if (filteredPosts().length === 0) {
            <div class="rounded-2xl border border-dashed border-border p-10 text-center bg-card">
              <mat-icon class="!w-10 !h-10 !text-[40px] text-muted-foreground">inbox</mat-icon>
              <p class="mt-2 text-sm font-semibold text-foreground">No posts matching this filter</p>
              <button
                type="button"
                (click)="filterCategory.set('all')"
                class="mt-2 text-xs font-bold text-primary underline"
              >
                View all incident feeds
              </button>
            </div>
          }

          @for (post of filteredPosts(); track post.id) {
            <article class="shadow-card rounded-2xl border border-border bg-card p-5 space-y-3 transition-all hover:shadow-md">
              <!-- Post Author Header -->
              <div class="flex items-start justify-between">
                <div class="flex items-center gap-3">
                  <img
                    [src]="post.authorAvatar"
                    [alt]="post.authorName"
                    class="h-11 w-11 rounded-full border border-border bg-muted object-cover"
                  />
                  <div>
                    <div class="flex items-center gap-1.5">
                      <h3 class="font-bold text-sm text-foreground leading-none">
                        {{ post.authorName }}
                      </h3>
                      @if (post.verified) {
                        <mat-icon class="!w-4 !h-4 !text-[16px] text-shield" title="Verified Cybersecurity Professional">
                          verified
                        </mat-icon>
                      }
                    </div>
                    <p class="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                      {{ post.authorHeadline }}
                    </p>
                    <p class="text-[11px] text-muted-foreground/75 font-mono">
                      {{ timeAgo(post.createdAt) }} • CyberAid Community
                    </p>
                  </div>
                </div>

                <span class="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                  Incident Log
                </span>
              </div>

              <!-- Post Text Content -->
              <p class="text-sm md:text-base text-foreground/95 leading-relaxed whitespace-pre-line">
                {{ post.content }}
              </p>

              <!-- Tags list -->
              <div class="flex flex-wrap gap-1.5 pt-1">
                @for (tag of post.tags; track tag) {
                  <span class="text-xs font-semibold text-primary hover:underline cursor-pointer">
                    {{ tag }}
                  </span>
                }
              </div>

              <!-- Media Attachment (Image or Video) -->
              @if (post.mediaType === 'image' && post.mediaUrl) {
                <div class="overflow-hidden rounded-xl border border-border bg-muted/30">
                  <img
                    [src]="post.mediaUrl"
                    alt="Cyber forensic evidence"
                    class="w-full max-h-[380px] object-cover"
                    loading="lazy"
                  />
                </div>
              }

              @if (post.mediaType === 'video' && post.mediaUrl) {
                <div class="overflow-hidden rounded-xl border border-border bg-navy text-navy-foreground shadow-sm">
                  @if (post.videoTitle) {
                    <div class="flex items-center gap-2 bg-navy-deep px-4 py-2 border-b border-navy-foreground/10 text-xs font-bold text-shield">
                      <mat-icon class="!w-4 !h-4 !text-[16px]">play_circle</mat-icon>
                      <span>{{ post.videoTitle }}</span>
                    </div>
                  }
                  <video
                    controls
                    preload="metadata"
                    class="w-full max-h-[360px] bg-black"
                  >
                    <source [src]="post.mediaUrl" type="video/mp4" />
                    Your browser does not support HTML5 video streaming.
                  </video>
                </div>
              }

              <!-- Stats & Counters -->
              <div class="flex items-center justify-between border-t border-border/60 pt-2 text-xs text-muted-foreground">
                <span class="flex items-center gap-1 font-semibold">
                  <mat-icon class="!w-4 !h-4 !text-[16px] text-shield">thumb_up</mat-icon>
                  <span>{{ post.likes }} found this helpful</span>
                </span>
                <span class="flex items-center gap-3">
                  @if (post.mine) {
                    <button type="button" (click)="deletePost(post)" class="font-semibold text-danger hover:underline">Delete</button>
                  }
                  <span>{{ post.comments.length }} comments</span>
                </span>
              </div>

              <!-- Interactive Actions Bar (Like, Comment, Share) -->
              <div class="grid grid-cols-3 gap-1 border-t border-border pt-1 text-xs font-semibold">
                <button
                  type="button"
                  (click)="handleLike(post)"
                  class="flex items-center justify-center gap-1.5 py-2 rounded-lg transition-colors"
                  [class.text-shield]="post.likedByMe"
                  [class.bg-shield/10]="post.likedByMe"
                  [class.text-muted-foreground]="!post.likedByMe"
                  [class.hover:bg-muted]="!post.likedByMe"
                >
                  <mat-icon class="!w-4 !h-4 !text-[18px]">
                    {{ post.likedByMe ? 'thumb_up' : 'thumb_up_off_alt' }}
                  </mat-icon>
                  <span>Helpful</span>
                </button>

                <button
                  type="button"
                  (click)="activeCommentPostId.set(activeCommentPostId() === post.id ? null : post.id)"
                  class="flex items-center justify-center gap-1.5 py-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <mat-icon class="!w-4 !h-4 !text-[18px]">chat_bubble_outline</mat-icon>
                  <span>Comment</span>
                </button>

                <button
                  type="button"
                  (click)="showToast('Incident link copied to clipboard')"
                  class="flex items-center justify-center gap-1.5 py-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <mat-icon class="!w-4 !h-4 !text-[18px]">share</mat-icon>
                  <span>Share Alert</span>
                </button>
              </div>

              <!-- Comments Section -->
              @if (activeCommentPostId() === post.id) {
                <div class="mt-3 pt-3 border-t border-border space-y-3 animate-in fade-in duration-200">
                  <!-- Comment Input Box -->
                  <div class="flex items-center gap-2">
                    <img
                      [src]="userAvatar()"
                      alt="Your avatar"
                      class="h-8 w-8 rounded-full border border-border object-cover"
                    />
                    <input
                      type="text"
                      #commentInput
                      placeholder="Add an advisory or response…"
                      (keyup.enter)="submitComment(post, commentInput.value); commentInput.value = ''"
                      class="flex-1 rounded-full border border-input bg-background px-4 py-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring"
                    />
                    <button
                      type="button"
                      (click)="submitComment(post, commentInput.value); commentInput.value = ''"
                      class="rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90"
                    >
                      Post
                    </button>
                  </div>

                  <!-- Existing Comments -->
                  <div class="space-y-2">
                    @for (c of post.comments; track c.id) {
                      <div class="flex items-start gap-2.5 rounded-xl bg-muted/40 p-2.5 text-xs">
                        <img
                          [src]="c.avatar"
                          [alt]="c.author"
                          class="h-7 w-7 rounded-full border border-border bg-card object-cover"
                        />
                        <div class="flex-1">
                          <div class="flex items-center justify-between">
                            <p class="font-bold text-foreground">{{ c.author }}</p>
                            <span class="text-[10px] text-muted-foreground">{{ timeAgo(c.createdAt) }}</span>
                          </div>
                          <p class="text-foreground/90 mt-0.5 leading-snug">{{ c.text }}</p>
                        </div>
                      </div>
                    }
                  </div>
                </div>
              }
            </article>
          }
        </main>

        <!-- RIGHT COLUMN: Threat Bulletins & Educational Videos (3 cols) -->
        <aside class="space-y-4 lg:col-span-3">
          <app-quiz />
          <!-- Live Threat Bulletins -->
          <div class="shadow-card rounded-2xl border border-border bg-card p-4 space-y-3">
            <div class="flex items-center justify-between">
              <h2 class="font-bold text-sm text-foreground flex items-center gap-1.5">
                <mat-icon class="!w-4 !h-4 !text-[18px] text-warning">shield_alert</mat-icon>
                <span>Active Threat Advisories</span>
              </h2>
              <span class="rounded bg-danger/10 px-1.5 py-0.5 text-[10px] font-bold text-danger">LIVE</span>
            </div>

            <div class="space-y-2 text-xs">
              <div class="rounded-xl border border-danger/30 bg-danger/5 p-2.5">
                <p class="font-bold text-danger">Fake Electricity Disconnection SMS</p>
                <p class="text-muted-foreground mt-0.5 leading-snug">
                  Fraudulent SMS claiming power cutoff tonight. Never call personal numbers.
                </p>
              </div>

              <div class="rounded-xl border border-warning/30 bg-warning/5 p-2.5">
                <p class="font-bold text-warning">WhatsApp Part-Time Job Scam</p>
                <p class="text-muted-foreground mt-0.5 leading-snug">
                  Tasks demanding prepaid deposits for YouTube likes and Google reviews.
                </p>
              </div>

              <div class="rounded-xl border border-border bg-muted/40 p-2.5">
                <p class="font-bold text-foreground">Customs Parcel Video Extortion</p>
                <p class="text-muted-foreground mt-0.5 leading-snug">
                  Fake law enforcement calling on video to demand digital bail.
                </p>
              </div>
            </div>
          </div>

          <!-- Video Testimonials & Educational Campaign -->
          <div class="shadow-card rounded-2xl border border-border bg-card p-4 space-y-3 text-xs">
            <h2 class="font-bold text-sm text-foreground flex items-center gap-1.5">
              <mat-icon class="!w-4 !h-4 !text-[18px] text-shield">ondemand_video</mat-icon>
              <span>Awareness Video Archive</span>
            </h2>
            <p class="text-muted-foreground text-[11px]">
              Educational materials curated by PRPCEM Department of Computer Science.
            </p>

            <div class="rounded-xl overflow-hidden border border-border bg-navy text-navy-foreground p-3">
              <div class="flex items-center gap-2 mb-2">
                <mat-icon class="!w-4 !h-4 !text-[16px] text-shield">play_circle_filled</mat-icon>
                <span class="font-bold text-xs">Golden Hour Response in 3 Minutes</span>
              </div>
              <p class="text-[11px] text-navy-foreground/75 leading-tight">
                Watch how freezing transaction trails within 60 minutes prevents fund siphonage.
              </p>
              <button
                type="button"
                (click)="showToast('Playing educational training module')"
                class="mt-2.5 w-full rounded-lg bg-shield py-1.5 text-xs font-bold text-shield-foreground hover:opacity-90"
              >
                Watch Video Module
              </button>
            </div>
          </div>

          <!-- Emergency Action Box -->
          <div class="rounded-2xl border border-danger/40 bg-danger/10 p-4 text-center">
            <mat-icon class="!w-8 !h-8 !text-[32px] text-danger leading-none mb-1">emergency</mat-icon>
            <p class="font-bold text-sm text-danger">Immediate Cyber Helpline</p>
            <p class="text-xs text-foreground/80 mt-1">
              National Cyber Crime Reporting Portal toll-free service:
            </p>
            <a
              href="tel:1930"
              class="mt-2 inline-flex items-center gap-2 rounded-xl bg-danger px-4 py-2 font-display text-sm font-bold text-danger-foreground shadow-sm hover:opacity-95"
            >
              <mat-icon class="!w-4 !h-4 !text-[16px]">call</mat-icon>
              <span>Dial 1930 Helpline</span>
            </a>
          </div>
        </aside>
      </div>
    </div>

    <!-- CREATE POST MODAL (LinkedIn-Style) -->
    @if (showPostModal()) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200">
        <div class="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-card space-y-4">
          <div class="flex items-center justify-between border-b border-border pb-3">
            <h3 class="font-bold text-base text-foreground">Share Cyber Experience or Evidence</h3>
            <button
              type="button"
              (click)="showPostModal.set(false)"
              class="rounded-lg p-1 text-muted-foreground hover:bg-muted"
            >
              <mat-icon class="!w-5 !h-5 !text-[20px]">close</mat-icon>
            </button>
          </div>

          <div class="flex items-center gap-3">
            <img [src]="userAvatar()" alt="User" class="h-10 w-10 rounded-full border border-border" />
            <div>
              <p class="font-bold text-sm text-foreground">{{ userName() }}</p>
              <span class="rounded bg-shield/15 px-2 py-0.5 text-[11px] font-semibold text-shield">
                Public Cyber Incident Stream
              </span>
            </div>
          </div>

          <!-- Post textarea -->
          <textarea
            [value]="newPostContent()"
            (input)="newPostContent.set($any($event.target).value)"
            rows="4"
            placeholder="What happened? Describe the scam call, SMS, link, or victim recovery step..."
            class="w-full resize-none rounded-xl border border-input bg-background p-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
          ></textarea>

          <!-- Media Type Toggle -->
          <div class="space-y-2">
            <div class="flex items-center gap-2 text-xs font-bold text-muted-foreground">
              <span>Attach Media:</span>
              <button
                type="button"
                (click)="selectedMediaType.set(selectedMediaType() === 'image' ? null : 'image')"
                class="rounded-md px-2.5 py-1 transition-colors"
                [class.bg-primary]="selectedMediaType() === 'image'"
                [class.text-primary-foreground]="selectedMediaType() === 'image'"
                [class.bg-muted]="selectedMediaType() !== 'image'"
              >
                📷 Image / Screenshot
              </button>
              <button
                type="button"
                (click)="selectedMediaType.set(selectedMediaType() === 'video' ? null : 'video')"
                class="rounded-md px-2.5 py-1 transition-colors"
                [class.bg-danger]="selectedMediaType() === 'video'"
                [class.text-danger-foreground]="selectedMediaType() === 'video'"
                [class.bg-muted]="selectedMediaType() !== 'video'"
              >
                🎥 Video Testimonial
              </button>
            </div>

            @if (selectedMediaType() === 'image') {
              <input
                type="text"
                [value]="mediaInputUrl()"
                (input)="mediaInputUrl.set($any($event.target).value)"
                placeholder="Image URL or screenshot link (e.g. https://...)"
                class="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring"
              />
            }

            @if (selectedMediaType() === 'video') {
              <div class="space-y-1.5">
                <input
                  type="text"
                  [value]="videoInputTitle()"
                  (input)="videoInputTitle.set($any($event.target).value)"
                  placeholder="Video Testimonial Title (e.g. How I Evaded a Telegram Task Scam)"
                  class="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring"
                />
                <input
                  type="text"
                  [value]="mediaInputUrl()"
                  (input)="mediaInputUrl.set($any($event.target).value)"
                  placeholder="MP4 Video URL (or sample: https://commondatastorage.googleapis.com/...)"
                  class="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            }
          </div>

          <!-- Forensic Tag selector -->
          <div class="space-y-1">
            <p class="text-xs font-bold text-muted-foreground">Select Incident Category Tag:</p>
            <div class="flex flex-wrap gap-1.5">
              @for (tag of commonTags; track tag) {
                <button
                  type="button"
                  (click)="toggleTag(tag)"
                  class="rounded-full px-2.5 py-0.5 text-xs font-medium transition-all"
                  [class.bg-primary]="selectedTags().includes(tag)"
                  [class.text-primary-foreground]="selectedTags().includes(tag)"
                  [class.bg-muted]="!selectedTags().includes(tag)"
                  [class.text-muted-foreground]="!selectedTags().includes(tag)"
                >
                  {{ tag }}
                </button>
              }
            </div>
          </div>

          <!-- Submit CTA -->
          <div class="flex items-center justify-end gap-2 border-t border-border pt-3">
            <button
              type="button"
              (click)="showPostModal.set(false)"
              class="rounded-xl px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              [disabled]="!newPostContent().trim() || isSubmitting()"
              (click)="handleCreatePost()"
              class="flex items-center gap-1.5 rounded-xl bg-shield px-5 py-2 text-xs font-bold text-shield-foreground shadow-sm hover:opacity-90 active:scale-95 disabled:opacity-50"
            >
              <mat-icon class="!w-4 !h-4 !text-[16px]">send</mat-icon>
              <span>{{ isSubmitting() ? 'Publishing…' : 'Post to Community' }}</span>
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Toast Notification -->
    @if (toastMsg()) {
      <div class="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-navy px-5 py-2.5 text-xs font-bold text-navy-foreground shadow-card border border-shield/40 animate-in fade-in">
        {{ toastMsg() }}
      </div>
    }
  `,
})
export class CommunityPage implements OnInit {
  authService = inject(AuthService);
  private api = inject(ApiService);

  posts = signal<CommunityPost[]>([]);
  filterCategory = signal<'all' | 'video' | 'image'>('all');
  showPostModal = signal<boolean>(false);
  isSubmitting = signal<boolean>(false);
  activeCommentPostId = signal<string | null>(null);
  toastMsg = signal<string>('');

  newPostContent = signal<string>('');
  selectedMediaType = signal<'image' | 'video' | null>(null);
  mediaInputUrl = signal<string>('');
  videoInputTitle = signal<string>('');
  selectedTags = signal<string[]>(['#CyberAwareness', '#VictimExperience']);

  commonTags = [
    '#UPIScam',
    '#PhishingLink',
    '#FakeElectricitySMS',
    '#DigitalArrest',
    '#VictimTestimonial',
    '#GoldenHourDefense',
  ];

  userName = computed(() => this.authService.currentUser()?.displayName || 'CyberAid Member');
  userAvatar = computed(
    () =>
      this.authService.currentUser()?.photoURL ||
      'https://api.dicebear.com/7.x/bottts/svg?seed=member'
  );
  userHeadline = computed(
    () =>
      this.authService.currentUser()?.headline ||
      'CyberAid community member'
  );

  myPostsCount = computed(
    () => this.posts().filter((p) => p.mine).length
  );
  videoCount = computed(() => this.posts().filter((p) => p.mediaType === 'video').length);
  imageCount = computed(() => this.posts().filter((p) => p.mediaType === 'image').length);

  filteredPosts = computed(() => {
    const cat = this.filterCategory();
    if (cat === 'video') return this.posts().filter((p) => p.mediaType === 'video');
    if (cat === 'image') return this.posts().filter((p) => p.mediaType === 'image');
    return this.posts();
  });

  ngOnInit() {
    this.fetchPosts();
  }

  async fetchPosts() {
    if (!this.api.isBrowser) return;
    try {
      const data = await this.api.get<{ posts: CommunityPost[] }>('/community/posts');
      this.posts.set(data.posts);
    } catch (err) {
      this.showToast(err instanceof Error ? err.message : 'Could not load posts');
    }
  }

  timeAgo(iso: string): string {
    const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
    if (s < 60) return 'Just now';
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
    return new Date(iso).toLocaleDateString();
  }

  openModalWithMedia(type: 'image' | 'video') {
    this.selectedMediaType.set(type);
    if (type === 'video' && !this.mediaInputUrl()) {
      this.mediaInputUrl.set(
        'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'
      );
      this.videoInputTitle.set('Victim Incident Recovery Testimonial');
    } else if (type === 'image' && !this.mediaInputUrl()) {
      this.mediaInputUrl.set(
        'https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&w=1200&q=80'
      );
    }
    this.showPostModal.set(true);
  }

  toggleTag(tag: string) {
    this.selectedTags.update((arr) =>
      arr.includes(tag) ? arr.filter((t) => t !== tag) : [...arr, tag]
    );
  }

  async handleCreatePost() {
    if (!this.newPostContent().trim()) return;
    this.isSubmitting.set(true);
    try {
      const { post } = await this.api.post<{ post: CommunityPost }>('/community/posts', {
        content: this.newPostContent(),
        mediaType: this.selectedMediaType() || undefined,
        mediaUrl: this.selectedMediaType() ? this.mediaInputUrl() || undefined : undefined,
        videoTitle: this.videoInputTitle() || undefined,
        tags: this.selectedTags(),
      });
      this.posts.update((list) => [post, ...list]);
      this.showPostModal.set(false);
      this.newPostContent.set('');
      this.mediaInputUrl.set('');
      this.videoInputTitle.set('');
      this.selectedMediaType.set(null);
      this.showToast('Incident experience shared with the CyberAid community');
    } catch (err) {
      this.showToast(err instanceof Error ? err.message : 'Could not publish your post');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async handleLike(post: CommunityPost) {
    try {
      const data = await this.api.post<{ likes: number; likedByMe: boolean }>(`/community/posts/${post.id}/like`);
      this.posts.update((list) => list.map((p) => (p.id === post.id ? { ...p, likes: data.likes, likedByMe: data.likedByMe } : p)));
    } catch (err) {
      this.showToast(err instanceof Error ? err.message : 'Could not update like');
    }
  }

  async submitComment(post: CommunityPost, text: string) {
    if (!text.trim()) return;
    try {
      const { comment } = await this.api.post<{ comment: CommunityPost['comments'][number] }>(`/community/posts/${post.id}/comments`, { text: text.trim() });
      this.posts.update((list) => list.map((p) => (p.id === post.id ? { ...p, comments: [...p.comments, comment] } : p)));
    } catch (err) {
      this.showToast(err instanceof Error ? err.message : 'Could not post comment');
    }
  }

  async deletePost(post: CommunityPost) {
    if (!confirm('Delete this post permanently?')) return;
    try {
      await this.api.delete(`/community/posts/${post.id}`);
      this.posts.update((list) => list.filter((p) => p.id !== post.id));
      this.showToast('Post deleted');
    } catch (err) {
      this.showToast(err instanceof Error ? err.message : 'Could not delete post');
    }
  }

  showToast(msg: string) {
    this.toastMsg.set(msg);
    setTimeout(() => this.toastMsg.set(''), 2500);
  }
}
