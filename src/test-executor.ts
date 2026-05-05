import { AlertReceiver } from "./core/alert-receiver/AlertReceiver";

const receiver = new AlertReceiver(3000);

receiver.onAlert((alert) => {
  console.log("\n🚨 Nueva alerta procesada:", alert);
});

receiver.start();
