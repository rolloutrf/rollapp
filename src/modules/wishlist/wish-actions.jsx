import { sharePageUrl } from "../../applications/location.js";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../runtime/api.js";
import { buildRepeatWishPayload } from "./wish-repeat.js";
import { withWishReward } from "../loyalty/wish-reward.jsx";
import { isWishSecret, wishSharePath } from "./wish-form-data.jsx";
import { wishSpaceId } from "../categories/wish-spaces.jsx";
import { useSession } from "../auth/session.jsx";
import { useToast } from "../shell/toast.jsx";

export function useWishActions({ wish, profile, lists = [], shareToken = "", onChanged, onDeleted }) {
  const toast = useToast();
  const { user } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  const refreshAfterMutation = async () => {
    try {
      await onChanged?.();
    } catch {
      toast("Изменение сохранено. Обновите страницу, чтобы увидеть актуальные данные.", "error");
    }
  };
  const requireLogin = () => {
    if (user) return false;
    const next = `${location.pathname}${location.search}`;
    navigate(`/login?next=${encodeURIComponent(next)}`);
    return true;
  };
  const reserve = async () => {
    if (requireLogin()) return false;
    setBusy(true);
    try {
      const result = await api.post(`/wishes/${wish.id}/reserve`, { shareToken: shareToken || wish.shareToken || "" });
      toast(result.reserved ? "Подарок забронирован — владелец не узнает кем" : "Бронь снята");
      await refreshAfterMutation();
      return true;
    } catch (error) {
      toast(error.message, "error");
      return false;
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await api.delete(`/wishes/${wish.id}`);
      toast("Желание удалено");
      await refreshAfterMutation();
      onDeleted?.();
      return true;
    } catch (error) {
      toast(error.message, "error");
      return false;
    } finally {
      setBusy(false);
    }
  };
  const leave = async () => {
    setBusy(true);
    try {
      await api.delete(`/wishes/${wish.id}/participation`);
      onDeleted?.();
      await refreshAfterMutation();
      toast("Совместное желание убрано с вашей доски");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      setBusy(false);
    }
  };
  const fulfilled = async () => {
    const targetFulfilled = wish.status !== "fulfilled";
    setBusy(true);
    try {
      await api.post(`/wishes/${wish.id}/fulfilled`, { fulfilled: targetFulfilled });
      toast(targetFulfilled ? "Отмечено исполненным ✦" : "Желание снова активно");
      await refreshAfterMutation();
      return true;
    } catch (error) {
      toast(error.message, "error");
      return false;
    } finally {
      setBusy(false);
    }
  };
  const share = async () => {
    if (isWishSecret(wish, lists)) {
      toast(wish.participants?.length ? "Секретное желание доступно вам и участникам" : "Секретное желание видно только вам", "error");
      return false;
    }
    try {
      await navigator.clipboard.writeText(sharePageUrl(wishSharePath({ wish, profile, lists, shareToken })));
      toast("Ссылка скопирована");
      return true;
    } catch {
      toast("Не удалось скопировать ссылку", "error");
      return false;
    }
  };
  const save = async () => {
    if (requireLogin()) return false;
    setBusy(true);
    try {
      const result = await api.post(`/wishes/${wish.id}/copy`, { shareToken: shareToken || wish.shareToken || "" });
      toast(withWishReward(
        wish.likedByMe ? "Желание уже в вашем общем списке" : "Понравилось — желание добавлено в ваш общий список",
        result.reward,
      ));
      await refreshAfterMutation();
      return true;
    } catch (error) {
      toast(error.message, "error");
      return false;
    } finally {
      setBusy(false);
    }
  };
  const update = async (payload, successMessage) => {
    setBusy(true);
    try {
      const result = await api.patch(`/wishes/${wish.id}`, payload);
      if (successMessage) toast(successMessage);
      await refreshAfterMutation();
      return result.wish;
    } catch (error) {
      toast(error.message, "error");
      return null;
    } finally {
      setBusy(false);
    }
  };
  const repeat = async () => {
    setBusy(true);
    try {
      const result = await api.post("/wishes", buildRepeatWishPayload(wish, wishSpaceId(wish, lists)));
      toast(withWishReward("Желание снова добавлено в активные ✦", result.reward));
      await refreshAfterMutation();
      return true;
    } catch (error) {
      toast(error.message, "error");
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, reserve, remove, leave, fulfilled, share, save, update, repeat };
}
