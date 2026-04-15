// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { ContentHint } from '@signalapp/libsignal-client';

import { createLogger } from '../logging/log.std.ts';
import { SignalService as Proto } from '../protobuf/index.std.ts';
import { messageSender } from '../textsecure/SendMessage.preload.ts';
import { itemStorage } from '../textsecure/Storage.preload.ts';
import { getSendOptions } from '../util/getSendOptions.preload.ts';
import type { ServiceIdString, AciString } from '../types/ServiceId.std.ts';
import { normalizeServiceId } from '../types/ServiceId.std.ts';
import type {
  MiMoAlertPayloadType,
  MiMoMetadataPayloadType,
} from '../types/MiMoMetadata.std.ts';
import {
  MIMO_PROTOCOL_VERSION,
  serializeMiMoEnvelope,
  type MiMoOutgoingMessageType,
  type MiMoSessionStatePayloadType,
} from '../types/MiMoProtocol.std.ts';

const log = createLogger('mimoMessageSender');

/**
 * MiMo metadata heartbeat to the therapist (direct Signal DataMessage).
 * Defaults `clientSessionId` to the local user ACI for tile correlation on the therapist.
 */
export async function sendMiMoHeartbeatToTherapist(
  recipientServiceId: ServiceIdString,
  payload: Readonly<
    Omit<MiMoMetadataPayloadType, 'clientSessionId' | 'heartbeatUnixMs'> & {
      clientSessionId?: string;
      heartbeatUnixMs?: number;
    }
  >
): Promise<void> {
  const ourAci = itemStorage.user.getCheckedAci() as AciString;
  const now = Date.now();
  await sendMiMoMessage(recipientServiceId, {
    kind: 'heartbeat',
    payload: {
      ...payload,
      clientSessionId: payload.clientSessionId ?? ourAci,
      heartbeatUnixMs: payload.heartbeatUnixMs ?? now,
    },
  });
}

export async function sendMiMoSessionStateToTherapist(
  recipientServiceId: ServiceIdString,
  payload: Readonly<MiMoSessionStatePayloadType>
): Promise<void> {
  await sendMiMoMessage(recipientServiceId, {
    kind: 'session_state',
    payload,
  });
}

export async function sendMiMoAlertToTherapist(
  recipientServiceId: ServiceIdString,
  payload: Readonly<MiMoAlertPayloadType>
): Promise<void> {
  await sendMiMoMessage(recipientServiceId, {
    kind: 'alert',
    payload,
  });
}

export async function sendBreakoutDirectInvite(
  recipientServiceId: ServiceIdString,
  pausedSessionTitle: string | null | undefined
): Promise<void> {
  await sendMiMoMessage(recipientServiceId, {
    kind: 'breakout_direct_invite',
    pausedSessionTitle: pausedSessionTitle ?? null,
  });
}

export async function sendRemoteControlResponse(
  recipientClientSessionId: string,
  approved: boolean,
  reason?: string
): Promise<void> {
  const recipientServiceId = normalizeServiceId(
    recipientClientSessionId,
    'sendRemoteControlResponse'
  );
  if (!recipientServiceId) {
    log.warn(
      `sendRemoteControlResponse: invalid recipient ${recipientClientSessionId}`
    );
    return;
  }

  await sendMiMoMessage(recipientServiceId, {
    kind: 'remote_control_response',
    approved,
    reason,
  });
}

export async function sendRustDeskCredentials(
  recipientClientSessionId: string,
  rustdeskId: string,
  temporaryPassword: string
): Promise<void> {
  const recipientServiceId = normalizeServiceId(
    recipientClientSessionId,
    'sendRustDeskCredentials'
  );
  if (!recipientServiceId) {
    log.warn(
      `sendRustDeskCredentials: invalid recipient ${recipientClientSessionId}`
    );
    return;
  }

  await sendMiMoMessage(recipientServiceId, {
    kind: 'rustdesk_credentials',
    rustdeskId,
    temporaryPassword,
  });
}

export async function sendRustDeskSessionEnded(
  recipientClientSessionId: string
): Promise<void> {
  const recipientServiceId = normalizeServiceId(
    recipientClientSessionId,
    'sendRustDeskSessionEnded'
  );
  if (!recipientServiceId) {
    log.warn(
      `sendRustDeskSessionEnded: invalid recipient ${recipientClientSessionId}`
    );
    return;
  }

  await sendMiMoMessage(recipientServiceId, {
    kind: 'rustdesk_session_ended',
  });
}

async function sendMiMoMessage(
  recipientServiceId: ServiceIdString,
  message: MiMoOutgoingMessageType
): Promise<void> {
  const ourAci = itemStorage.user.getCheckedAci() as AciString;
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
