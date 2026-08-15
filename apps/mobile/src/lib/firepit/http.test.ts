import {
  onRequestRecovered,
  reportRequestFailure,
  reportRequestSuccess,
} from "./http";

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(msg);
};

if (import.meta.main) {
  let notified = 0;
  const listener = () => {
    notified += 1;
  };
  const off = onRequestRecovered(listener);

  reportRequestSuccess();
  assert(notified === 0, "success without a prior failure does not notify");

  reportRequestFailure();
  reportRequestSuccess();
  assert(notified === 1, "success after failure notifies once");

  reportRequestSuccess();
  assert(notified === 1, "a second success does not re-notify");

  reportRequestFailure();
  reportRequestSuccess();
  assert(notified === 2, "a failure re-arms the flag");

  off();
  reportRequestFailure();
  reportRequestSuccess();
  assert(notified === 2, "unsubscribed listener is not notified");

  console.log("http.test.ts: all assertions passed");
}
