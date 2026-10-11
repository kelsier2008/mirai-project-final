// `\\-` keeps the class valid under the regex mode browsers use for the pattern attribute.
export const STUDENT_CODE_RE='^[A-Za-z0-9]+(?:[_\\-][A-Za-z0-9]+)*$';
export const STUDENT_CODE_HINT='Letters and numbers; single hyphens or underscores allowed between them (e.g. S001, 2024-CS-17).';
