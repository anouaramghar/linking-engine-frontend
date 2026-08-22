import { Avatar, type AvatarController } from "@bible-strong/avatar-react";
import type { AnimationKey, AvatarDefinition } from "@bible-strong/avatar-core";
import type { Ref } from "react";

import { agentAvatarDefinition } from "./agentAvatarDefinition";

interface AgentAvatarProps {
  animation?: AnimationKey;
  autoplay?: boolean;
  className?: string;
  controllerRef?: Ref<AvatarController>;
  defaultAnimation?: AnimationKey;
  size?: number | string;
}

/**
 * The assistant's live avatar from Bible Strong Avatar Lab. The definition is
 * local and validated by the official renderer; animation remains in the
 * browser, so the assistant does not need a second network request or an
 * iframe just to blink and change expression.
 */
export default function AgentAvatar({
  animation,
  autoplay = true,
  className,
  controllerRef,
  defaultAnimation = "idle",
  size = "100%",
}: AgentAvatarProps) {
  return (
    <Avatar
      ref={controllerRef}
      definition={agentAvatarDefinition as AvatarDefinition}
      {...(animation === undefined ? { defaultAnimation, autoplay } : { animation })}
      size={size}
      className={className}
      ariaLabel="LinkMesh assistant avatar"
    />
  );
}
