import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import express from "express";
import { getAllQueues } from "@/lib/task/queues";

const PORT = parseInt(process.env.BULL_BOARD_PORT || "3010", 10);

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");

const queues = getAllQueues();
createBullBoard({
  queues: queues.map((q) => new BullMQAdapter(q)),
  serverAdapter,
});

const app = express();
app.use("/admin/queues", serverAdapter.getRouter());

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Bull Board running at http://0.0.0.0:${PORT}/admin/queues`);
});
