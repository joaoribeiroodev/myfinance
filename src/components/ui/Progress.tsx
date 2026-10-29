"use client";

import { motion } from "framer-motion";
import clsx from "clsx";

export function Progress({
  percent,
  color = "brand",
  className,
}: {
  percent: number;
  color?: "brand" | "income" | "expense" | "amber";
  className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, percent));
  const colorClass = {
    brand: "bg-brand-500",
    income: "bg-income-500",
    expense: "bg-expense-500",
    amber: "bg-amber-500",
  }[color];

  return (
    <div className={clsx("progress-track", className)}>
      <motion.div
        className={clsx("progress-fill", colorClass)}
        initial={{ width: 0 }}
        animate={{ width: `${clamped}%` }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}
