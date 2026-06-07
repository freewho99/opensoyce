// Deterministic exit codes per the CLI v0 sub-sketch §3.
// NOT_EVALUATED is distinct from BLOCK so reviewers can tell "no evidence"
// from "negative evidence." Network errors never silently degrade.

export const EXIT_ALLOW = 0;
export const EXIT_BLOCK = 1;
export const EXIT_WARN = 2;
export const EXIT_NOT_EVALUATED = 3;
export const EXIT_NETWORK_ERROR = 4;
export const EXIT_USAGE_ERROR = 5;

export type ExitCode = 0 | 1 | 2 | 3 | 4 | 5;

export type GateAction = 'ALLOW' | 'WARN' | 'BLOCK' | 'NOT_EVALUATED';

export function exitCodeForAction(action: GateAction): ExitCode {
  switch (action) {
    case 'ALLOW':
      return EXIT_ALLOW;
    case 'WARN':
      return EXIT_WARN;
    case 'BLOCK':
      return EXIT_BLOCK;
    case 'NOT_EVALUATED':
      return EXIT_NOT_EVALUATED;
  }
}

export function worstAction(actions: GateAction[]): GateAction {
  if (actions.includes('BLOCK')) return 'BLOCK';
  if (actions.includes('WARN')) return 'WARN';
  if (actions.includes('ALLOW')) return 'ALLOW';
  return 'NOT_EVALUATED';
}
