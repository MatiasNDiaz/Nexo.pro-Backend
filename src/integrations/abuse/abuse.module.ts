import { Global, Module } from '@nestjs/common';
import { CaptchaService } from './captcha.service';

/** CAPTCHA (Cloudflare Turnstile). Global: lo usan el registro, el login y el contacto. */
@Global()
@Module({
  providers: [CaptchaService],
  exports: [CaptchaService],
})
export class AbuseModule {}
