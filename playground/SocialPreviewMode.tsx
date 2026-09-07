/** Source artwork for the static 1200 × 630 social sharing card (?social=1). */
import { useState } from "react";
import { Heart, Sparkle } from "@phosphor-icons/react";
import { FillyCharacter } from "../src/react/FillyCharacter";
import "./social-preview.css";

export function SocialPreviewMode() {
  const [ready, setReady] = useState(false);
  return (
    <main className="social-card" data-ready={ready ? "1" : undefined}>
      <div className="social-copy">
        <div className="social-brand">
          <span className="care-wordmark">CARE</span>
          <span className="brand-divider" />
          <span>Open Healthcare Network</span>
        </div>
        <div className="social-intro">
          <p className="social-kicker">A LITTLE COMPANION, A LOT OF HEART</p>
          <h1>Hello,<br />I’m Filly<span className="social-period">.</span></h1>
          <p className="social-description">The friendly CARE mascot.<br />A feeling for every moment.</p>
        </div>
        <div className="social-address">
          <Heart size={21} weight="fill" aria-hidden="true" />
          <span>mascot.ohc.network</span>
        </div>
      </div>
      <div className="social-portrait">
        <FillyCharacter
          state="listening"
          size={650}
          freezeAt={1.2}
          dpr={2}
          interactive={false}
          followPointer={false}
          onReady={() => setReady(true)}
        />
      </div>
      <Sparkle className="social-sparkle" size={30} weight="light" aria-hidden="true" />
    </main>
  );
}
