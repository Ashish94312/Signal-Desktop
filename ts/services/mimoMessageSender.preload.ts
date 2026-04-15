// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { ContentHint } from '@signalapp/libsignal-client';

import { createLogger } from '../logging/log.std.ts';
import { SignalService as Proto } from '../protobuf/index.std.ts';
import { messageSender } from '../textsecure/SendMessage.preload.ts';
import { itemStorage } from '../textsecure/Storage.preload.ts';
import { getSendOptions } from '../util/getSendOptions.preload.ts';
import type { ServiceIdString } from '../types/ServiceId.std.ts';
import {
  normalizeServiceId,
  type AciString,
} from '../types/ServiceId.std.ts';
import {
  MIMO_PROTOCOL_VERSION,
  serializeMiMoEnvelope,
  type MiMoOutgoingMessageType,
} from '../types/MiMoProtocol.std.ts';

const log = createLogger('mimoMessageSender');

export async function sendBreakoutDirectInvite(
  recipientServiceId: ServiceIdString,
  pausedSessionTitle: string | null | undefined
): Promise<void> {
  await sendMiMoMessage(recipientServiceId, {
    kind: 'breakout_direct_invite',
    pausedSessionTitle: pausedSessionTitle ?? null,
  });
}

export async function sendTherapistPrompt(
  recipientServiceId: ServiceIdString,
  text: string
): Promise<void> {
  await sendMiMoMessage(recipientServiceId, {
    kind: 'therapist_prompt',
    text,
  });
}

export async function sendRemoteControlRequest(
  recipientClientSessionId: string
): Promise<void> {
  const recipientServiceId = normalizeServiceId(
    recipientClientSessionId,
    'sendRemoteControlRequest'
  );
  if (!recipientServiceId) {
    log.warn(
      `sendRemoteControlRequest: invalid recipient ${recipientClientSessionId}`
    );
    return;
  }

  const ourAci = itemStorage.user.getCheckedAci() as AciString;
  await sendMiMoMessage(recipientServiceId, {
    kind: 'remote_control_request',
    therapistId: ourAci,
  });
}

export async function sendRemoteRelease(
  recipientClientSessionId: string
): Promise<void> {
  const recipientServiceId = normalizeServiceId(
    recipientClientSessionId,
    'sendRemoteRelease'
  );
  if (!recipientServiceId) {
    log.warn(`sendRemoteRelease: invalid recipient ${recipientClientSessionId}`);
    return;
  }

  await sendMiMoMessage(recipientServiceId, {
    kind: 'remote_release',
  });
}

async function sendMiMoMessage(
  recipientServiceId: ServiceIdString,
  message: MiMoOutgoingMessageType
): Promise<void> {
  const ourAci = itemStorage.user.getCheckedAci();
  const envelope = {
    version: MIMO_PROTOCOL_VERSION,
    senderAci: ourAci,
    timestamp: Date.now(),
    message,
  };

  await sendMessageViaSignal(recipientServiceId, serializeMiMoEnvelope(envelope));
}

async function sendMessageViaSignal(
  recipientServiceId: ServiceIdString,
  body: string
): Promise<void> {
  const timestamp = Date.now();

  const proto: Proto.Content.Params = {
    content: {
      dataMessage: {
        body,
        timestamp: BigInt(timestamp),
        profileKey: null,
        flags: 0,
        expireTimer: 0,
        expireTimerVersion: 0,
        attachments: [],
        groupV2: null,
        quote: null,
        contact: [],
        preview: [],
        sticker: null,
        requiredProtocolVersion: 0,
        isViewOnce: false,
        reaction: null,
        delete: null,
        bodyRanges: [],
        groupCallUpdate: null,
        payment: null,
        storyContext: null,
        giftBadge: null,
        pollCreate: null,
        pollTerminate: null,
        pollVote: null,
        pinMessage: null,
        unpinMessage: null,
        adminDelete: null,
      },
    },
    pniSignatureMessage: null,
    senderKeyDistributionMessage: null,
  };

  const conversation = window.ConversationController.get(recipientServiceId);
  if (!conversation) {
    log.warn(
      `sendMessageViaSignal: no conversation for ${recipientServiceId}`
    );
    return;
  }

  const options = await getSendOptions(conversation.attributes);
  await messageSender.sendIndividualProto({
    serviceId: recipientServiceId,
    proto,
    timestamp,
    contentHint: ContentHint.Default,
    urgent: false,
    options,
  });

  log.info(`sendMessageViaSignal: sent to ${recipientServiceId}`);
}
