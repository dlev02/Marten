import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useAction, useMutation } from "convex/react";
import * as Popover from "@radix-ui/react-popover";
import { Camera, Check, RotateCcw, Smile } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { useData } from "../../lib/data";
import { profileAvatars, profileAvatarUrl } from "../../lib/profileAvatar";
import {
  Avatar,
  Button,
  Field,
  Modal,
  Panel,
  useTask,
} from "../../components/folio/ui";
import {
  drawProfileCrop,
  exportProfileCrop,
  initialCrop,
  loadProfileImage,
  type Crop,
} from "./profileCrop";
import "./profileSettings.css";

export function ProfileSettings() {
  const { profile } = useData();
  const save = useMutation(api.workspace.saveProfile);
  const saveAvatar = useMutation(api.workspace.saveProfileAvatar);
  const uploadPhoto = useAction(api.workspace.uploadProfilePhoto);
  const task = useTask();
  const [name, setName] = useState(profile?.name ?? "");
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [image, setImage] = useState<ImageBitmap | null>(null);
  const [crop, setCrop] = useState<Crop>(initialCrop);
  const [cropError, setCropError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const loadVersion = useRef(0);
  const drag = useRef<{ x: number; y: number; crop: Crop } | null>(null);

  useEffect(() => () => image?.close(), [image]);
  useEffect(
    () => () => {
      loadVersion.current++;
    },
    [],
  );
  useEffect(() => {
    if (!image || !canvas) return;
    try {
      drawProfileCrop(canvas, image, crop);
      setCropError(null);
    } catch (error) {
      setCropError(
        error instanceof Error
          ? error.message
          : "The photo could not be prepared.",
      );
    }
  }, [image, crop, canvas]);

  async function choosePhoto(file: File) {
    const version = ++loadVersion.current;
    await task.run(async () => {
      const next = await loadProfileImage(file);
      if (version !== loadVersion.current) {
        next.close();
        return;
      }
      setCrop(initialCrop);
      setCropError(null);
      setImage(next);
    });
  }
  function pan(event: PointerEvent<HTMLCanvasElement>) {
    if (!drag.current || !image || task.busy) return;
    const start = drag.current;
    const side = Math.min(image.width, image.height) / start.crop.zoom;
    const scale = side / event.currentTarget.clientWidth;
    const x =
      image.width === side
        ? 0
        : start.crop.x -
          (2 * (event.clientX - start.x) * scale) / (image.width - side);
    const y =
      image.height === side
        ? 0
        : start.crop.y -
          (2 * (event.clientY - start.y) * scale) / (image.height - side);
    setCrop({
      ...start.crop,
      x: Math.max(-1, Math.min(1, x)),
      y: Math.max(-1, Math.min(1, y)),
    });
  }
  async function savePhoto() {
    if (!image) return;
    const ok = await task.run(async () => {
      const blob = await exportProfileCrop(image, crop);
      await uploadPhoto({
        bytes: await blob.arrayBuffer(),
        contentType: blob.type,
      });
    }, "Profile photo saved");
    if (ok) setImage(null);
  }
  if (!profile) return null;
  return (
    <Panel
      title="Your profile"
      className="settings-preference-panel profile-settings"
    >
      <div className="profile-photo-row">
        <div
          className="profile-photo-current"
          aria-label="Current profile picture"
        >
          <Avatar
            name={profile.name}
            logo={profileAvatarUrl(profile)}
            size="large"
          />
        </div>
        <div className="profile-photo-actions">
          <div className="profile-photo-buttons">
            <Button
              icon={<Camera size={16} />}
              disabled={task.busy}
              onClick={() => fileInput.current?.click()}
            >
              {profile.avatarUrl ? "Change photo" : "Upload photo"}
            </Button>
            <Popover.Root open={avatarOpen} onOpenChange={setAvatarOpen}>
              <Popover.Trigger asChild>
                <Button icon={<Smile size={16} />} disabled={task.busy}>
                  Choose avatar
                </Button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  className="filter-popover profile-avatar-popover"
                  align="start"
                  sideOffset={8}
                >
                  <h3>Choose an avatar</h3>
                  <div
                    className="profile-avatar-options"
                    role="group"
                    aria-label="Avatar options"
                  >
                    {profileAvatars.map((avatar) => {
                      const selected =
                        !profile.avatarUrl &&
                        profile.avatarPreset === avatar.id;
                      return (
                        <button
                          key={avatar.id}
                          type="button"
                          aria-label={`${avatar.name} avatar`}
                          aria-pressed={selected}
                          className={`profile-avatar-option ${selected ? "selected" : ""}`}
                          disabled={task.busy}
                          onClick={() =>
                            void task
                              .run(
                                () => saveAvatar({ preset: avatar.id }),
                                "Avatar saved",
                              )
                              .then((ok) => {
                                if (ok) setAvatarOpen(false);
                              })
                          }
                        >
                          <img src={avatar.url} alt="" />
                          {selected && (
                            <span className="profile-avatar-check">
                              <Check size={11} />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
            {(profile.avatarUrl || profile.avatarPreset) && (
              <Button
                tone="quiet"
                disabled={task.busy}
                onClick={() =>
                  void task.run(
                    () => saveAvatar({ preset: null }),
                    "Profile picture removed",
                  )
                }
              >
                Use initials
              </Button>
            )}
          </div>
          <p className="settings-helper">
            JPEG, PNG, or WebP · up to 10 MB. Crop before saving.
          </p>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label="Choose profile photo"
          className="profile-photo-input"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void choosePhoto(file);
          }}
        />
      </div>
      <form
        className="profile-name-form"
        onSubmit={(event) => {
          event.preventDefault();
          void task.run(() => save({ name }), "Profile saved");
        }}
      >
        <Field label="Name">
          <input
            aria-label="Your name"
            maxLength={80}
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Button
          type="submit"
          disabled={task.busy || !name.trim() || name.trim() === profile.name}
        >
          Save name
        </Button>
      </form>
      <Modal
        open={image !== null}
        onClose={() => {
          if (!task.busy) setImage(null);
        }}
        title="Adjust your photo"
        description="Drag to position your photo, or use the controls below. Only the cropped image is uploaded."
      >
        <div className="profile-crop-editor">
          <canvas
            ref={setCanvas}
            width={512}
            height={512}
            className="profile-crop-preview"
            role="img"
            aria-label="Profile photo crop preview"
            onPointerDown={(event) => {
              if (task.busy) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = { x: event.clientX, y: event.clientY, crop };
            }}
            onPointerMove={pan}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
          />
          <fieldset className="profile-crop-controls" disabled={task.busy}>
            <legend className="sr-only">Photo position</legend>
            <label>
              <span>Zoom</span>
              <input
                aria-label="Photo zoom"
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={crop.zoom}
                onChange={(event) =>
                  setCrop({ ...crop, zoom: Number(event.target.value) })
                }
              />
              <output>{Math.round(crop.zoom * 100)}%</output>
            </label>
            <label>
              <span>Horizontal</span>
              <input
                aria-label="Photo horizontal position"
                type="range"
                min={-1}
                max={1}
                step={0.01}
                value={crop.x}
                onChange={(event) =>
                  setCrop({ ...crop, x: Number(event.target.value) })
                }
              />
              <output>{Math.round(crop.x * 100)}</output>
            </label>
            <label>
              <span>Vertical</span>
              <input
                aria-label="Photo vertical position"
                type="range"
                min={-1}
                max={1}
                step={0.01}
                value={crop.y}
                onChange={(event) =>
                  setCrop({ ...crop, y: Number(event.target.value) })
                }
              />
              <output>{Math.round(crop.y * 100)}</output>
            </label>
          </fieldset>
          {cropError && (
            <p role="alert" className="profile-crop-error">
              {cropError}
            </p>
          )}
          <div className="profile-crop-actions">
            <Button
              tone="quiet"
              icon={<RotateCcw size={14} />}
              disabled={task.busy}
              onClick={() => setCrop(initialCrop)}
            >
              Reset crop
            </Button>
            <Button disabled={task.busy} onClick={() => setImage(null)}>
              Cancel
            </Button>
            <Button
              tone="primary"
              disabled={task.busy || !!cropError}
              onClick={() => void savePhoto()}
            >
              {task.busy ? "Saving…" : "Save photo"}
            </Button>
          </div>
        </div>
      </Modal>
    </Panel>
  );
}
