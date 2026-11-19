export { Mailer, MailError, type MailMessage, type MailResult } from './mailer';
export { MailModule, createMailer } from './mail.module';
export { ResendMailer } from './providers/resend.mailer';
export { MemoryMailer, DisabledMailer } from './providers/memory.mailer';
export { passwordResetMail } from './templates/password-reset';
