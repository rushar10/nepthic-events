-- Typed codes match with O/0 and I/1 folded together (core/ticket-code-format.ts codeKey).
UPDATE "tickets" SET "code_key" = translate("code_key", 'OI', '01');
