import { useCallback, useState } from "react";
import { useAuth } from "../lib/auth";
import { PIN } from "../lib/lexicon";
import { parseAtUri } from "../lib/util";
import { createPin, deleteRecord } from "../lib/writes";
import { ActionButton } from "./nav/ActionButton";

interface PinButtonProps {
  bbsDid: string;
  initialRkey: string | null;
}

export default function PinButton({ bbsDid, initialRkey }: PinButtonProps) {
  const { user, agent } = useAuth();
  const [pinRkey, setPinRkey] = useState(initialRkey);

  const handleTogglePin = useCallback(async () => {
    if (!agent) return;
    if (pinRkey) {
      await deleteRecord(agent, PIN, pinRkey);
      setPinRkey(null);
    } else {
      const resp = await createPin(agent, bbsDid);
      const uri = (resp.data as { uri: string }).uri;
      setPinRkey(parseAtUri(uri).rkey);
    }
  }, [agent, bbsDid, pinRkey]);

  if (!user) return null;

  return (
    <ActionButton onClick={handleTogglePin}>
      {pinRkey ? "✕ unpin" : "+ pin"}
    </ActionButton>
  );
}
