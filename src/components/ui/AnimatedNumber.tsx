"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { currency } from "@/lib/format";

export function AnimatedCurrency({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 90, damping: 20, mass: 0.6 });
  const [display, setDisplay] = useState("R$ 0,00");
  const firstRun = useRef(true);

  useEffect(() => {
    mv.set(firstRun.current ? value : mv.get());
    spring.set(value);
    firstRun.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    const unsub = spring.on("change", (v) => setDisplay(currency(v)));
    return unsub;
  }, [spring]);

  return <motion.span className={className}>{display}</motion.span>;
}

export function AnimatedPercent({ value }: { value: number }) {
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 90, damping: 20 });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    spring.set(value);
  }, [value, spring]);

  useEffect(() => {
    const unsub = spring.on("change", (v) => setDisplay(Math.round(v)));
    return unsub;
  }, [spring]);

  return <>{display}</>;
}
