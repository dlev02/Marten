import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import "./sortable.css";

type Handle = Pick<
  ReturnType<typeof useSortable>,
  "attributes" | "listeners" | "setActivatorNodeRef"
>;
const HandleContext = createContext<Handle | null>(null);
// A list only slides items vertically; a grid lets them move in both directions.
const LayoutContext = createContext<"list" | "grid">("list");

/** One list owns one ordering scope, including nested category groups. */
export function SortableList<T extends string>({
  ids,
  onReorder,
  children,
  disabled = false,
  layout = "list",
  className = "",
}: {
  ids: T[];
  onReorder: (ids: T[]) => Promise<boolean | void> | void;
  children: (ids: T[]) => ReactNode;
  disabled?: boolean;
  /** `grid` mirrors a multi-column layout such as the dashboard. */
  layout?: "list" | "grid";
  className?: string;
}) {
  const [pending, setPending] = useState<T[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const key = ids.join(",");
  useEffect(() => {
    setPending(null);
  }, [key]);
  const order =
    pending &&
    pending.length === ids.length &&
    pending.every((id) => ids.includes(id))
      ? pending
      : ids;
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      accessibility={{
        announcements: {
          onDragStart: ({ active }) =>
            `Picked up ${active.data.current?.name ?? "item"}. Use arrow keys to move, Space to drop, or Escape to cancel.`,
          onDragOver: ({ active, over }) =>
            over
              ? `${active.data.current?.name ?? "Item"} moved to position ${order.indexOf(over.id as T) + 1} of ${order.length}.`
              : undefined,
          onDragEnd: ({ active, over }) =>
            over
              ? `${active.data.current?.name ?? "Item"} dropped at position ${order.indexOf(over.id as T) + 1} of ${order.length}.`
              : "Reordering canceled.",
          onDragCancel: () => "Reordering canceled.",
        },
      }}
      onDragStart={() => setDragging(true)}
      onDragCancel={() => setDragging(false)}
      onDragEnd={({ active, over }) => {
        setDragging(false);
        if (disabled || saving || !over || active.id === over.id) return;
        const from = order.indexOf(active.id as T),
          to = order.indexOf(over.id as T);
        if (from < 0 || to < 0) return;
        const next = arrayMove(order, from, to);
        setPending(next);
        setSaving(true);
        void Promise.resolve()
          .then(() => onReorder(next))
          .then((saved) => {
            if (saved === false) setPending(null);
          })
          .catch(() => setPending(null))
          .finally(() => setSaving(false));
      }}
    >
      <SortableContext
        items={order}
        strategy={
          layout === "grid" ? rectSortingStrategy : verticalListSortingStrategy
        }
        disabled={disabled || saving || ids.length < 2}
      >
        <LayoutContext.Provider value={layout}>
          <div
            className={`sortable-list ${className}`}
            data-dragging={dragging || undefined}
          >
            {children(order)}
          </div>
        </LayoutContext.Provider>
      </SortableContext>
    </DndContext>
  );
}

export function SortableItem({
  id,
  name,
  className = "",
  children,
  disabled = false,
}: {
  id: string;
  name: string;
  className?: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    data: { name },
    disabled,
    transition: { duration: 240, easing: "cubic-bezier(0.2, 0, 0, 1)" },
  });
  const layout = useContext(LayoutContext);
  return (
    <HandleContext.Provider
      value={{ attributes, listeners, setActivatorNodeRef }}
    >
      <div
        ref={setNodeRef}
        className={`sortable-item ${className}`}
        data-active-drag={isDragging || undefined}
        style={{
          transform: CSS.Transform.toString(
            transform
              ? {
                  ...transform,
                  x: layout === "grid" ? transform.x : 0,
                  scaleX: 1,
                  scaleY: 1,
                }
              : null,
          ),
          transition,
        }}
      >
        {children}
      </div>
    </HandleContext.Provider>
  );
}

export function SortableHandle({
  name,
  disabled = false,
}: {
  name: string;
  disabled?: boolean;
}) {
  const handle = useContext(HandleContext);
  return (
    <button
      type="button"
      ref={handle?.setActivatorNodeRef}
      {...handle?.attributes}
      {...handle?.listeners}
      className="settings-grip sortable-handle"
      aria-label={`Drag to reorder ${name}`}
      disabled={disabled || !!handle?.attributes["aria-disabled"]}
    >
      <GripVertical size={16} />
    </button>
  );
}
