import type { FillyState } from "../src/core/types";

export interface ExhibitMedia {
  src: string;
  poster: string;
  title: string;
  durationMs: number;
  sourceSlide: number;
  aspectRatio?: number;
}

export interface ExhibitCue {
  chapterIndex: number;
  text: string;
  durationMs: number;
  media?: ExhibitMedia;
}

export interface ExhibitChapter {
  id: string;
  label: string;
  title: string;
  description: string;
  points: readonly [string, string, string];
  tone: "green" | "blue" | "rose";
  expression: FillyState;
  narration: readonly string[];
  demos?: readonly (ExhibitMedia & { narration: string })[];
}

export const EXHIBIT_CHAPTERS: readonly ExhibitChapter[] = [
  {
    id: "hello",
    label: "Meet CARE",
    title: "Meet CARE.",
    description: "The open-source operating system for healthcare.",
    points: ["Patient flow", "Information flow", "Revenue flow"],
    tone: "green",
    expression: "happy",
    narration: [
      "Hello! I'm Filly, the CARE mascot. Let me introduce you to CARE, from Open Healthcare Network.",
      "Think of a hospital as three connected flows: patients, information, and revenue. CARE brings those workflows together on an open-source platform.",
      "From a neighbourhood clinic to a hospital or a home visit, the idea is simple: technology that supports people caring for people.",
    ],
  },
  {
    id: "journey",
    label: "The patient journey",
    title: "One connected care journey.",
    description: "From the first appointment to the next follow-up.",
    points: ["Patient records", "Labs & pharmacy", "Hospital operations"],
    tone: "blue",
    expression: "listening",
    narration: [
      "A patient's story should not have to start from scratch at every visit. CARE brings their records and encounters together.",
      "Care teams can manage appointments, clinical notes, investigations, and prescriptions as part of a connected workflow.",
      "Labs, pharmacy, inventory, and billing are part of the picture too, connecting clinical care with everyday hospital operations.",
    ],
    demos: [
      {
        src: "/exhibit-media/clinical-records.mp4",
        poster: "/exhibit-media/clinical-records.jpg",
        title: "Clinical records, connected.",
        durationMs: 19000,
        aspectRatio: 1280 / 872,
        sourceSlide: 16,
        narration: "Here is CARE capturing clinical information. Structured forms bring symptoms, conditions, medications, and other observations into the patient's record.",
      },
      {
        src: "/exhibit-media/scheduling.mp4",
        poster: "/exhibit-media/scheduling.jpg",
        title: "An easier path to an appointment.",
        durationMs: 33000,
        aspectRatio: 1280 / 868,
        sourceSlide: 17,
        narration: "This scheduling demo connects clinician availability with appointment booking. Public facility pages help patients find a service and plan their visit.",
      },
      {
        src: "/exhibit-media/pharmacy.mp4",
        poster: "/exhibit-media/pharmacy.jpg",
        title: "From prescription to pharmacy.",
        durationMs: 17000,
        aspectRatio: 1280 / 868,
        sourceSlide: 23,
        narration: "The patient journey continues at the pharmacy. CARE connects prescriptions, dispensing, and inventory so the care team can follow the same workflow.",
      },
    ],
  },
  {
    id: "everywhere",
    label: "Care beyond walls",
    title: "Care goes beyond hospital walls.",
    description: "Specialist support. Community connections. Continuity of care.",
    points: ["TeleICU", "Community clinics", "Home-based care"],
    tone: "rose",
    expression: "happy",
    narration: [
      "Not everyone lives close to a specialist. CARE supports TeleICU workflows that connect remote critical care teams with specialist support.",
      "It also supports clinics and home-based palliative care, with records, care plans, referrals, and follow-up.",
      "Different settings, connected information, and a shared purpose: supporting the people delivering care, wherever they work.",
    ],
    demos: [
      {
        src: "/exhibit-media/remote-monitoring.mp4",
        poster: "/exhibit-media/remote-monitoring.jpg",
        title: "A closer connection, from a distance.",
        durationMs: 18000,
        aspectRatio: 16 / 9,
        sourceSlide: 31,
        narration: "This is remote monitoring in CARE. Integrated camera views give remote care teams visual context alongside clinical information, supporting collaboration across locations.",
      },
    ],
  },
  {
    id: "connected",
    label: "Built to connect",
    title: "Different systems. A shared language.",
    description: "Open standards make room for a connected health system.",
    points: ["FHIR-based records", "Open APIs", "Extensible apps"],
    tone: "blue",
    expression: "thinking",
    narration: [
      "Healthcare uses many different tools. CARE is built around FHIR-based health records, shared terminology, and open APIs.",
      "These standards help systems exchange information. Apps and integrations add capabilities around a shared core.",
      "Organisations can adapt CARE to local workflows and connect it with other services, instead of starting over each time.",
    ],
  },
  {
    id: "ai",
    label: "People-led AI",
    title: "AI drafts. Clinicians decide.",
    description: "Assistive AI, with clinical accountability staying human.",
    points: ["Live documentation", "Record summaries", "Human review"],
    tone: "green",
    expression: "listening",
    narration: [
      "Structured health information also creates a foundation for assistive AI, including clinical documentation and summarisation.",
      "The important part is human review. These tools support healthcare professionals; they do not replace clinical judgement.",
      "CARE brings that approach together with role-based access and audit trails, keeping accountability part of the workflow.",
    ],
    demos: [
      {
        src: "/exhibit-media/filly-documentation.mp4",
        poster: "/exhibit-media/filly-documentation.jpg",
        title: "Meet Filly at work.",
        durationMs: 18000,
        aspectRatio: 16 / 9,
        sourceSlide: 46,
        narration: "I have a job beyond this stage! The deck shows Filly helping turn a consultation into structured clinical documentation, ready for a healthcare professional to review.",
      },
      {
        src: "/exhibit-media/doctor-summary.mp4",
        poster: "/exhibit-media/doctor-summary.jpg",
        title: "The patient's story, in view.",
        durationMs: 22000,
        aspectRatio: 1280 / 738,
        sourceSlide: 50,
        narration: "The doctor-summary demo brings the patient's record into a brief before an encounter. It supports preparation, while the clinician reviews the information and makes the decisions.",
      },
    ],
  },
  {
    id: "open",
    label: "Open by design",
    title: "Built in the open. Built for everyone.",
    description: "A digital public good, strengthened by a shared community.",
    points: ["Digital public good", "MIT licensed", "Community built"],
    tone: "rose",
    expression: "happy",
    narration: [
      "CARE is a verified digital public good, with source code available under the MIT licence.",
      "Governments, hospitals, and implementation partners can use and adapt the software without proprietary licence lock-in.",
      "Open Healthcare Network brings clinicians, developers, and institutions together to improve the shared platform over time.",
    ],
  },
  {
    id: "together",
    label: "Join the network",
    title: "Better healthcare is a team effort.",
    description: "Bring your experience. Help shape what comes next.",
    points: ["Build with us", "Shape the workflows", "Partner with OHC"],
    tone: "green",
    expression: "happy",
    narration: [
      "Are you a healthcare professional, a developer, or an organisation working to improve care? There is a place for you in this network.",
      "Visit ohc dot network, or meet the team here, to explore CARE, contribute, or start a conversation.",
      "I'm Filly. Thanks for spending a moment with me. Together, we can build better tools for the people who care for us.",
    ],
  },
];

export function captionDuration(text: string): number {
  return Math.max(6000, text.trim().split(/\s+/).length * 430 + 1600);
}

export const EXHIBIT_CUES: readonly ExhibitCue[] = EXHIBIT_CHAPTERS.flatMap((chapter, chapterIndex) => [
  ...chapter.narration.map((text) => ({ chapterIndex, text, durationMs: captionDuration(text) })),
  ...(chapter.demos ?? []).map((media) => ({
    chapterIndex,
    text: media.narration,
    durationMs: Math.max(captionDuration(media.narration), media.durationMs),
    media,
  })),
],
);

export const EXHIBIT_DURATION_MS = EXHIBIT_CUES.reduce((total, cue) => total + cue.durationMs, 0);

export interface ExhibitPlayback {
  cueIndex: number;
  playing: boolean;
}

export const INITIAL_EXHIBIT_PLAYBACK: ExhibitPlayback = { cueIndex: 0, playing: true };

export type ExhibitAction =
  | { type: "advance" | "toggle-playing" | "restart" }
  | { type: "chapter"; chapterIndex: number };

export function exhibitReducer(playback: ExhibitPlayback, action: ExhibitAction): ExhibitPlayback {
  switch (action.type) {
    case "advance":
      return playback.playing
        ? { ...playback, cueIndex: (playback.cueIndex + 1) % EXHIBIT_CUES.length }
        : playback;
    case "toggle-playing":
      return { ...playback, playing: !playback.playing };
    case "restart":
      return { ...INITIAL_EXHIBIT_PLAYBACK };
    case "chapter": {
      const cueIndex = EXHIBIT_CUES.findIndex((cue) => cue.chapterIndex === action.chapterIndex);
      return cueIndex < 0 ? playback : { ...playback, cueIndex };
    }
  }
}

interface ExhibitCueOptions {
  onFinish(): void;
  onSpeakingChange(speaking: boolean): void;
  onVoiceUnavailable(): void;
  speech?: {
    synthesis: Pick<SpeechSynthesis, "speak" | "cancel" | "getVoices">;
    createUtterance(text: string): SpeechSynthesisUtterance;
  };
}

export function startExhibitCue(
  cue: (typeof EXHIBIT_CUES)[number],
  { onFinish, onSpeakingChange, onVoiceUnavailable, speech }: ExhibitCueOptions,
): () => void {
  const startedAt = Date.now();
  const minimumDurationMs = cue.media?.durationMs ?? 0;
  const durationMs = Math.max(cue.durationMs, minimumDurationMs);
  let stopped = false;
  let finished = false;
  let speechSettled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let utterance: SpeechSynthesisUtterance | undefined;

  function schedule(callback: () => void, delay: number) {
    clearTimeout(timer);
    timer = setTimeout(callback, delay);
  }

  function detachSpeech() {
    if (!utterance) return;
    utterance.onstart = null;
    utterance.onend = null;
    utterance.onerror = null;
  }

  function finish() {
    if (stopped || finished) return;
    finished = true;
    clearTimeout(timer);
    onSpeakingChange(false);
    onFinish();
  }

  function fallback() {
    if (stopped || finished || speechSettled) return;
    speechSettled = true;
    detachSpeech();
    speech?.synthesis.cancel();
    onVoiceUnavailable();
    onSpeakingChange(true);
    schedule(finish, Math.max(1200, durationMs - (Date.now() - startedAt)));
  }

  if (!speech) {
    onSpeakingChange(true);
    schedule(finish, durationMs);
  } else {
    onSpeakingChange(false);
    try {
      utterance = speech.createUtterance(cue.text);
      const voices = speech.synthesis.getVoices().filter((voice) => voice.lang.startsWith("en"));
      const voice = voices.find((candidate) => candidate.default)
        ?? voices.find((candidate) => candidate.localService)
        ?? voices[0];
      if (voice) utterance.voice = voice;
      utterance.lang = voice?.lang ?? "en";
      utterance.rate = 0.95;
      utterance.pitch = 1.08;
      utterance.onstart = () => {
        if (stopped || finished || speechSettled) return;
        onSpeakingChange(true);
        schedule(fallback, Math.max(24000, cue.durationMs * 2));
      };
      utterance.onend = () => {
        if (stopped || finished || speechSettled) return;
        speechSettled = true;
        onSpeakingChange(false);
        schedule(finish, Math.max(900, minimumDurationMs - (Date.now() - startedAt)));
      };
      utterance.onerror = fallback;
      schedule(fallback, 3500);
      speech.synthesis.cancel();
      speech.synthesis.speak(utterance);
    } catch {
      fallback();
    }
  }

  return () => {
    stopped = true;
    clearTimeout(timer);
    detachSpeech();
    speech?.synthesis.cancel();
  };
}

export function startExhibitVideo(video: HTMLVideoElement, onUnavailable: () => void): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function ready() {
    clearTimeout(timer);
  }

  function unavailable() {
    if (stopped) return;
    stopped = true;
    ready();
    video.pause();
    onUnavailable();
  }

  function waiting() {
    if (stopped) return;
    ready();
    timer = setTimeout(unavailable, 8000);
  }

  video.addEventListener("playing", ready);
  video.addEventListener("waiting", waiting);
  video.addEventListener("stalled", waiting);
  video.addEventListener("error", unavailable);
  waiting();
  try {
    void video.play().catch(unavailable);
  } catch {
    unavailable();
  }

  return () => {
    stopped = true;
    ready();
    video.removeEventListener("playing", ready);
    video.removeEventListener("waiting", waiting);
    video.removeEventListener("stalled", waiting);
    video.removeEventListener("error", unavailable);
    video.pause();
  };
}