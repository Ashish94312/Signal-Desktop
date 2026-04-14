// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import React, { useCallback, useReducer, useRef, useState } from 'react';
import lodash from 'lodash';

import { createGroupV2 } from '../groups.preload.ts';
import {
  toggleSelectedContactForGroupAddition,
  OneTimeModalState,
} from '../groups/toggleSelectedContactForGroupAddition.std.ts';
import { missingCaseError } from '../util/missingCaseError.std.ts';
import { createLogger } from '../logging/log.std.ts';
import * as Errors from '../types/errors.std.ts';
import type { LocalizerType } from '../types/Util.std.ts';
import {
  getGroupSizeHardLimit,
  getGroupSizeRecommendedLimit,
} from '../groups/limits.dom.ts';
import type { SmartChooseGroupMembersModalPropsType } from '../state/smart/ChooseGroupMembersModal.preload.tsx';
import { SmartChooseGroupMembersModal } from '../state/smart/ChooseGroupMembersModal.preload.tsx';
import {
  AddGroupMemberErrorDialog,
  AddGroupMemberErrorDialogMode,
} from './AddGroupMemberErrorDialog.dom.tsx';
import { Modal } from './Modal.dom.tsx';
import { GroupTitleInput } from './GroupTitleInput.dom.tsx';
import { Button, ButtonVariant } from './Button.dom.tsx';
import { Spinner } from './Spinner.dom.tsx';
import { AvatarPreview } from './AvatarPreview.dom.tsx';
import { AvatarEditor } from './AvatarEditor.dom.tsx';
import { DisappearingTimerSelect } from './DisappearingTimerSelect.dom.tsx';
import { AvatarColors } from '../types/Colors.std.ts';
import type { AvatarDataType } from '../types/Avatar.std.ts';
import { DurationInSeconds } from '../util/durations/index.std.ts';
import { deleteAvatar, writeNewAvatarData } from '../util/migrations.preload.ts';
import { isSameAvatarData } from '../util/isSameAvatarData.std.ts';

const { omit, without } = lodash;

const maxGroupSize = getGroupSizeHardLimit(1001);
const maxRecommendedGroupSize = getGroupSizeRecommendedLimit(151);

const log = createLogger('TherapistNewGroupWizard');

function filterLocalAvatarData(
  avatars: ReadonlyArray<AvatarDataType>,
  data: AvatarDataType
): Array<AvatarDataType> {
  return avatars.filter(avatarData => !isSameAvatarData(data, avatarData));
}

function getNextAvatarId(avatars: ReadonlyArray<AvatarDataType>): number {
  if (avatars.length === 0) {
    return 1;
  }
  return Math.max(...avatars.map(x => Number(x.id))) + 1;
}

enum PickActionType {
  CloseMaximumGroupSizeModal,
  CloseRecommendedMaximumGroupSizeModal,
  RemoveSelectedContact,
  ToggleSelectedContact,
  UpdateSearchTerm,
}

type PickAction =
  | { type: PickActionType.CloseMaximumGroupSizeModal }
  | { type: PickActionType.CloseRecommendedMaximumGroupSizeModal }
  | { type: PickActionType.RemoveSelectedContact; conversationId: string }
  | {
      type: PickActionType.ToggleSelectedContact;
      conversationId: string;
      numberOfContactsAlreadyInGroup: number;
    }
  | { type: PickActionType.UpdateSearchTerm; searchTerm: string };

type PickStateType = {
  maximumGroupSizeModalState: OneTimeModalState;
  recommendedGroupSizeModalState: OneTimeModalState;
  searchTerm: string;
  selectedConversationIds: ReadonlyArray<string>;
};

function pickReducer(
  state: Readonly<PickStateType>,
  action: Readonly<PickAction>
): PickStateType {
  switch (action.type) {
    case PickActionType.CloseMaximumGroupSizeModal:
      return {
        ...state,
        maximumGroupSizeModalState: OneTimeModalState.Shown,
      };
    case PickActionType.CloseRecommendedMaximumGroupSizeModal:
      return {
        ...state,
        recommendedGroupSizeModalState: OneTimeModalState.Shown,
      };
    case PickActionType.RemoveSelectedContact:
      return {
        ...state,
        selectedConversationIds: without(
          state.selectedConversationIds,
          action.conversationId
        ),
      };
    case PickActionType.ToggleSelectedContact:
      return {
        ...state,
        ...toggleSelectedContactForGroupAddition(action.conversationId, {
          maxGroupSize,
          maxRecommendedGroupSize,
          maximumGroupSizeModalState: state.maximumGroupSizeModalState,
          numberOfContactsAlreadyInGroup: action.numberOfContactsAlreadyInGroup,
          recommendedGroupSizeModalState: state.recommendedGroupSizeModalState,
          selectedConversationIds: state.selectedConversationIds,
        }),
      };
    case PickActionType.UpdateSearchTerm:
      return {
        ...state,
        searchTerm: action.searchTerm,
      };
    default:
      throw missingCaseError(action);
  }
}

const conversationIdsAlreadyInGroup = new Set<string>();

const renderChooseGroupMembersModal = (
  props: SmartChooseGroupMembersModalPropsType
) => <SmartChooseGroupMembersModal {...props} />;

export type TherapistNewGroupWizardPropsType = {
  i18n: LocalizerType;
  onClose: () => void;
  onGroupCreated: (conversationId: string) => void;
};

export function TherapistNewGroupWizard({
  i18n,
  onClose,
  onGroupCreated,
}: TherapistNewGroupWizardPropsType): React.JSX.Element {
  const numberOfContactsAlreadyInGroup = 0;
  const isGroupAlreadyFull = numberOfContactsAlreadyInGroup >= maxGroupSize;
  const isGroupAlreadyOverRecommendedMaximum =
    numberOfContactsAlreadyInGroup >= maxRecommendedGroupSize;

  const [pickState, dispatchPick] = useReducer(pickReducer, {
    maximumGroupSizeModalState: isGroupAlreadyFull
      ? OneTimeModalState.Showing
      : OneTimeModalState.NeverShown,
    recommendedGroupSizeModalState: isGroupAlreadyOverRecommendedMaximum
      ? OneTimeModalState.Shown
      : OneTimeModalState.NeverShown,
    searchTerm: '',
    selectedConversationIds: [],
  });

  const pickStateRef = useRef(pickState);
  pickStateRef.current = pickState;

  const [stage, setStage] = useState<'pickMembers' | 'setMetadata'>(
    'pickMembers'
  );
  const [memberIdsForCreate, setMemberIdsForCreate] = useState<
    ReadonlyArray<string>
  >([]);
  const [groupName, setGroupName] = useState('');
  const [groupAvatar, setGroupAvatar] = useState<
    Uint8Array<ArrayBuffer> | undefined
  >();
  const [userAvatarData, setUserAvatarData] = useState<
    ReadonlyArray<AvatarDataType>
  >([]);
  const [isEditingAvatar, setIsEditingAvatar] = useState(false);
  const [groupExpireTimer, setGroupExpireTimer] = useState<DurationInSeconds>(
    DurationInSeconds.ZERO
  );
  const [createErrorMessage, setCreateErrorMessage] = useState<string | null>(
    null
  );
  const [isCreating, setIsCreating] = useState(false);

  const [avatarColor] = AvatarColors;

  const saveAvatarToDisk = useCallback(async (avatarData: AvatarDataType) => {
    if (!avatarData.buffer) {
      throw new Error('No avatar Uint8Array provided');
    }

    const { path: imagePath, ...localImage } = await writeNewAvatarData(
      avatarData.buffer
    );

    setUserAvatarData(prev => [
      {
        ...avatarData,
        ...localImage,
        imagePath,
        id: getNextAvatarId(prev),
      },
      ...prev,
    ]);
  }, []);

  const deleteAvatarFromDisk = useCallback(
    async (avatarData: AvatarDataType) => {
      if (avatarData.imagePath) {
        await deleteAvatar(avatarData.imagePath);
      }
      setUserAvatarData(prev => filterLocalAvatarData(prev, avatarData));
    },
    []
  );

  const replaceAvatar = useCallback(
    (curr: AvatarDataType, prev?: AvatarDataType) => {
      setUserAvatarData(prevList => {
        const filtered = prev
          ? filterLocalAvatarData(prevList, prev)
          : prevList;
        return [
          {
            ...curr,
            id: prev?.id ?? getNextAvatarId(prevList),
          },
          ...filtered,
        ];
      });
    },
    []
  );

  const goToMetadataStage = useCallback(() => {
    setMemberIdsForCreate([...pickStateRef.current.selectedConversationIds]);
    setStage('setMetadata');
  }, []);

  const handleCreate = useCallback(async () => {
    const trimmed = groupName.trim();
    if (!trimmed) {
      return;
    }

    setIsCreating(true);
    setCreateErrorMessage(null);
    try {
      const conversation = await createGroupV2({
        name: trimmed,
        avatar: groupAvatar,
        expireTimer: groupExpireTimer,
        conversationIds: memberIdsForCreate,
        avatars: userAvatarData.map(avatarData => omit(avatarData, ['buffer'])),
      });
      onGroupCreated(conversation.id);
    } catch (error) {
      log.error('createGroupV2 failed', Errors.toLogFormat(error));
      setCreateErrorMessage(Errors.toLogFormat(error));
    } finally {
      setIsCreating(false);
    }
  }, [
    groupAvatar,
    groupExpireTimer,
    groupName,
    memberIdsForCreate,
    onGroupCreated,
    userAvatarData,
  ]);

  if (pickState.maximumGroupSizeModalState === OneTimeModalState.Showing) {
    return (
      <AddGroupMemberErrorDialog
        i18n={i18n}
        maximumNumberOfContacts={maxGroupSize}
        mode={AddGroupMemberErrorDialogMode.MaximumGroupSize}
        onClose={() => {
          dispatchPick({ type: PickActionType.CloseMaximumGroupSizeModal });
        }}
      />
    );
  }

  if (pickState.recommendedGroupSizeModalState === OneTimeModalState.Showing) {
    return (
      <AddGroupMemberErrorDialog
        i18n={i18n}
        mode={AddGroupMemberErrorDialogMode.RecommendedMaximumGroupSize}
        onClose={() => {
          dispatchPick({
            type: PickActionType.CloseRecommendedMaximumGroupSizeModal,
          });
        }}
        recommendedMaximumNumberOfContacts={maxRecommendedGroupSize}
      />
    );
  }

  if (stage === 'pickMembers') {
    const confirmAdds = goToMetadataStage;
    const removeSelectedContact = (conversationId: string) => {
      dispatchPick({
        type: PickActionType.RemoveSelectedContact,
        conversationId,
      });
    };
    const setSearchTerm = (term: string) => {
      dispatchPick({
        type: PickActionType.UpdateSearchTerm,
        searchTerm: term,
      });
    };
    const toggleSelectedContact = (conversationId: string) => {
      dispatchPick({
        type: PickActionType.ToggleSelectedContact,
        conversationId,
        numberOfContactsAlreadyInGroup,
      });
    };

    return renderChooseGroupMembersModal({
      confirmAdds,
      conversationIdsAlreadyInGroup,
      maxGroupSize,
      onClose,
      removeSelectedContact,
      searchTerm: pickState.searchTerm,
      selectedConversationIds: pickState.selectedConversationIds,
      setSearchTerm,
      toggleSelectedContact,
    });
  }

  return (
    <Modal
      modalName="TherapistNewGroupWizard.SetMetadata"
      hasXButton
      i18n={i18n}
      onClose={onClose}
      padded
      title={i18n('icu:setGroupMetadata__title')}
    >
      <form
        className="module-left-pane__header__form"
        onSubmit={event => {
          event.preventDefault();
          void handleCreate();
        }}
        style={{ display: 'grid', gap: '16px', minWidth: 'min(360px, 90vw)' }}
      >
        {isEditingAvatar && (
          <Modal
            modalName="TherapistNewGroupWizard.AvatarEditor"
            hasXButton
            i18n={i18n}
            onClose={() => setIsEditingAvatar(false)}
            title={i18n('icu:LeftPaneSetGroupMetadataHelper__avatar-modal-title')}
          >
            <AvatarEditor
              avatarColor={avatarColor}
              avatarValue={groupAvatar}
              deleteAvatarFromDisk={deleteAvatarFromDisk}
              i18n={i18n}
              isGroup
              onCancel={() => setIsEditingAvatar(false)}
              onSave={newAvatar => {
                setGroupAvatar(newAvatar);
                setIsEditingAvatar(false);
              }}
              userAvatarData={userAvatarData}
              replaceAvatar={replaceAvatar}
              saveAvatarToDisk={saveAvatarToDisk}
            />
          </Modal>
        )}

        <AvatarPreview
          avatarColor={avatarColor}
          avatarValue={groupAvatar}
          i18n={i18n}
          isEditable
          isGroup
          onClick={() => setIsEditingAvatar(true)}
          showUploadButton
          style={{
            height: 96,
            margin: 0,
            width: 96,
          }}
        />

        <div className="module-GroupInput--container">
          <GroupTitleInput
            disabled={isCreating}
            i18n={i18n}
            onChangeValue={setGroupName}
            value={groupName}
          />
        </div>

        <section className="module-left-pane__header__form__expire-timer">
          <div className="module-left-pane__header__form__expire-timer__label">
            {i18n('icu:disappearingMessages')}
          </div>
          <DisappearingTimerSelect
            disabled={isCreating}
            i18n={i18n}
            value={groupExpireTimer}
            onChange={setGroupExpireTimer}
          />
        </section>

        {createErrorMessage ? (
          <div className="module-AddGroupMembersModal__error-message">
            <div>{i18n('icu:updateGroupAttributes__error-message')}</div>
            <pre
              style={{
                margin: '8px 0 0',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontSize: '12px',
                opacity: 0.9,
              }}
            >
              {createErrorMessage}
            </pre>
          </div>
        ) : null}

        <div
          style={{
            display: 'flex',
            gap: '10px',
            justifyContent: 'flex-end',
            flexWrap: 'wrap',
          }}
        >
          <Button
            disabled={isCreating}
            onClick={() => {
              setStage('pickMembers');
            }}
            variant={ButtonVariant.Secondary}
          >
            {i18n('icu:setGroupMetadata__back-button')}
          </Button>
          <Button
            disabled={isCreating || !groupName.trim()}
            variant={ButtonVariant.Primary}
            type="submit"
          >
            {isCreating ? (
              <Spinner size="20px" svgSize="small" direction="on-avatar" />
            ) : (
              i18n('icu:setGroupMetadata__create-group')
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
