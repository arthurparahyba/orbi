import { useDataWriter, useResponseStart } from './runtime-port.ts';
import { UiPart, type UiComponent } from '@orbi/contracts';

/**
 * The `ui` data channel of a conversation. A Flue data part is unique per
 * response (a later write replaces it), so the part carries every component
 * shown in the current response; a component written again with the same `id`
 * is updated in place (a stepper advancing, an approval decided).
 */
const shownByConversation = new Map<string, Map<string, UiComponent>>();

export function useUiChannel(conversationId: string): (component: UiComponent) => void {
  const writePart = useDataWriter('ui', { schema: UiPart });
  useResponseStart(() => {
    shownByConversation.set(conversationId, new Map());
  });
  return (component) => {
    let shown = shownByConversation.get(conversationId);
    if (!shown) shownByConversation.set(conversationId, (shown = new Map()));
    shown.set(component.id, component);
    writePart({ components: [...shown.values()] });
  };
}
