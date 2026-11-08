// The Exam Mode switch at the right of the menu bar: Exam Mode is one click
// away and its state is always in sight (frontend/settings/exam-mode.ts).

import { setExamMode, useApp } from "@frontend/app/store";
import { Icon } from "./icons";
import { showAnswerFilePicker } from "./pickers";

export function ExamModeSwitch() {
  const on = useApp((s) => s.prefs.examMode);
  return (
    <>
      {on && (
        <button type="button" className="exam-answer-button" title="Write answers in a file of any kind, saved automatically in the answer folder" onClick={showAnswerFilePicker}>
          <Icon name="newFile" size={14} />
          Answer File
        </button>
      )}
      <ExamSwitch on={on} />
    </>
  );
}

function ExamSwitch({ on }: { on: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className={`exam-switch${on ? " on" : ""}`}
      title={
        on
          ? "Exam Mode is on: suggestions, hovers and checking while typing are off. Click to turn it off."
          : "Exam Mode is off. Click to turn off suggestions, hovers and checking while typing."
      }
      onClick={() => void setExamMode(!on)}
    >
      <Icon name="exam" size={14} />
      <span className="exam-switch-label">Exam Mode</span>
      <span className="exam-switch-track" aria-hidden>
        <span className="exam-switch-knob" />
      </span>
      <span className="exam-switch-state">{on ? "On" : "Off"}</span>
    </button>
  );
}
