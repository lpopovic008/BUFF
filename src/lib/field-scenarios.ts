// Every kind of play the fields on the floor act out (see ball-flight), as ESPN would word it — for trying them out on
// the floor one at a time (see FloorFieldsLab). In each line `{O}` is the team with the ball and `{D}` the other one;
// `toGo` is how far the team with the ball had to go to the end zone when it was snapped.

export interface FieldScenario {
  label: string;
  text: string;
  toGo: number;
}

export const FIELD_SCENARIOS: FieldScenario[] = [
  { label: "Pass", text: "J.Allen pass short right to K.Shakir to {D} 35 for 12 yards (T.Bernard).", toGo: 47 },
  { label: "Deep pass", text: "J.Allen pass deep left to K.Shakir to {D} 32 for 38 yards (T.Bernard).", toGo: 70 },
  { label: "Passing TD", text: "J.Allen pass deep middle to K.Shakir for 28 yards, TOUCHDOWN.", toGo: 28 },
  { label: "TD + extra point", text: "J.Allen pass short left to D.Kincaid for 18 yards, TOUCHDOWN. T.Bass extra point is GOOD, Center-R.Ferguson.", toGo: 18 },
  { label: "Incomplete", text: "J.Allen pass incomplete deep right to K.Shakir.", toGo: 47 },
  {
    label: "Interception",
    text: "J.Allen pass deep left intended for K.Shakir INTERCEPTED by T.Bernard at {D} 20. T.Bernard to {D} 35 for 15 yards (J.Cook).",
    toGo: 47,
  },
  { label: "Pick six", text: "J.Allen pass short right intended for K.Shakir INTERCEPTED by T.Bernard at {O} 40. T.Bernard for 40 yards, TOUCHDOWN.", toGo: 60 },
  { label: "Run", text: "J.Cook up the middle to {D} 49 for 6 yards (N.Bolton).", toGo: 55 },
  { label: "Run for a loss", text: "J.Cook left end to {O} 42 for -3 yards (N.Bolton).", toGo: 55 },
  { label: "Rushing TD", text: "J.Cook right end for 9 yards, TOUCHDOWN.", toGo: 9 },
  { label: "Scramble", text: "J.Allen scrambles right end to {D} 39 for 11 yards (N.Bolton).", toGo: 50 },
  { label: "Lateral", text: "J.Allen pass short left to S.Diggs to {D} 50 for 10 yards. S.Diggs lateral to J.Cook to {D} 35 for 15 yards (T.Bernard).", toGo: 60 },
  { label: "Sack", text: "J.Allen sacked at {O} 40 for -7 yards (G.Rousseau).", toGo: 53 },
  { label: "Strip sack", text: "J.Allen sacked at {O} 40 for -7 yards (G.Rousseau). FUMBLES (G.Rousseau), RECOVERED by {D}-J.Phillips at {O} 38.", toGo: 53 },
  {
    label: "Fumble",
    text: "J.Cook up the middle to {D} 40 for 4 yards, FUMBLES (Z.Sieler), RECOVERED by {D}-J.Phillips at {D} 40. J.Phillips to {D} 48 for 8 yards (J.Cook).",
    toGo: 44,
  },
  { label: "Fumbled snap", text: "(Shotgun) J.Allen FUMBLES (Aborted) at {O} 30, RECOVERED by {D}-G.Rousseau at {O} 28.", toGo: 70 },
  { label: "Safety", text: "J.Allen sacked in end zone for -4 yards, SAFETY (G.Rousseau).", toGo: 97 },
  { label: "Kneel", text: "J.Allen kneels to {O} 29 for -1 yards.", toGo: 70 },
  { label: "Spike", text: "J.Allen spiked the ball to stop the clock.", toGo: 40 },
  { label: "Field goal", text: "T.Bass 45 yard field goal is GOOD, Center-R.Ferguson, Holder-S.Martin.", toGo: 27 },
  { label: "Missed field goal", text: "T.Bass 52 yard field goal is No Good, Wide Right, Center-R.Ferguson, Holder-S.Martin.", toGo: 34 },
  { label: "Blocked field goal", text: "T.Bass 45 yard field goal is BLOCKED (E.Oliver), Center-R.Ferguson, Holder-S.Martin.", toGo: 27 },
  { label: "Extra point", text: "T.Bass extra point is GOOD, Center-R.Ferguson, Holder-S.Martin.", toGo: 15 },
  { label: "Two-point try", text: "TWO-POINT CONVERSION ATTEMPT. J.Allen pass to K.Shakir is complete. ATTEMPT SUCCEEDS.", toGo: 2 },
  { label: "Punt return", text: "S.Martin punts 45 yards to {D} 20, Center-R.Ferguson. K.Coleman to {D} 32 for 12 yards (N.Bolton).", toGo: 65 },
  { label: "Punt, fair catch", text: "S.Martin punts 48 yards to {D} 15, Center-R.Ferguson, fair catch by K.Coleman.", toGo: 63 },
  { label: "Punt, touchback", text: "S.Martin punts 52 yards to end zone, Center-R.Ferguson, Touchback.", toGo: 45 },
  { label: "Punt, downed", text: "S.Martin punts 40 yards to {D} 8, Center-R.Ferguson, downed by {O}-T.Johnson.", toGo: 48 },
  { label: "Punt out of bounds", text: "S.Martin punts 42 yards to {D} 12, Center-R.Ferguson, out of bounds.", toGo: 54 },
  { label: "Blocked punt", text: "S.Martin punt is BLOCKED by G.Rousseau, Center-R.Ferguson, RECOVERED by {D}-G.Rousseau.", toGo: 70 },
  // On a kickoff the team with the ball is the one receiving it; the other kicks from its own 35.
  { label: "Kickoff return", text: "T.Bass kicks 65 yards from {D} 35 to {O} 0. K.Coleman to {O} 28 for 28 yards (N.Bolton).", toGo: 75 },
  { label: "Kickoff touchback", text: "T.Bass kicks 65 yards from {D} 35 to end zone, Touchback.", toGo: 75 },
  { label: "Kick return TD", text: "T.Bass kicks 65 yards from {D} 35 to {O} 0. K.Coleman for 100 yards, TOUCHDOWN.", toGo: 75 },
  { label: "Onside kick", text: "T.Bass onside kick 11 yards from {D} 35 to {D} 46. RECOVERED by {D}-J.Watson.", toGo: 54 },
  { label: "False start", text: "PENALTY on {O}-J.Smith, False Start, 5 yards, enforced at {O} 30 - No Play.", toGo: 70 },
  { label: "Flag on a run", text: "J.Cook left end to {D} 23 for 7 yards (N.Bolton). PENALTY on {D}-N.Bolton, Defensive Holding, 5 yards, enforced at {D} 23.", toGo: 30 },
  {
    label: "No-play holding",
    text: "J.Cook left end to {D} 23 for 7 yards (D.Dawson). PENALTY on {O}-D.Dawson, Offensive Holding, 10 yards, enforced at {O} 30 - No Play.",
    toGo: 70,
  },
  {
    label: "Challenge upheld",
    text: "J.Cook left end to {D} 23 for 7 yards (N.Bolton). Kansas City challenged the runner was down by contact ruling, and the play was Upheld. The ruling on the field stands.",
    toGo: 30,
  },
  {
    label: "Challenge reversed",
    text: "J.Allen pass short right to K.Shakir to {D} 20 for 15 yards (T.Bernard). Kansas City challenged the pass completion ruling, and the play was REVERSED. J.Allen pass incomplete short right to K.Shakir.",
    toGo: 35,
  },
];

/** A scenario's line for a game: the team with the ball, and the other. */
export function scenarioText(scenario: FieldScenario, offense: string, defense: string): string {
  return scenario.text.replaceAll("{O}", offense).replaceAll("{D}", defense);
}
