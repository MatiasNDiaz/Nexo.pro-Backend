import { Global, Module } from '@nestjs/common';
import { type PushConfig, pushConfig } from '../../config/push.config';
import { FakePushProvider } from './fake-push.provider';
import { PUSH_PROVIDER, type PushProvider } from './push-provider';
import { WebPushProvider } from './web-push.provider';

/** `null` con PUSH_PROVIDER=disabled: no se aceptan suscripciones y no se manda nada. */
export function createPushProvider(config: PushConfig): PushProvider | null {
  switch (config.provider) {
    case 'disabled':
      return null;
    case 'fake':
      return new FakePushProvider();
    case 'webpush':
      return new WebPushProvider(config.vapid);
  }
}

@Global()
@Module({
  providers: [{ provide: PUSH_PROVIDER, inject: [pushConfig.KEY], useFactory: createPushProvider }],
  exports: [PUSH_PROVIDER],
})
export class PushProviderModule {}
