import type { Variants, Transition } from "framer-motion";

export const ease = {
  smooth: [0.22, 1, 0.36, 1] as [number, number, number, number],
  soft: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number],
  snappy: [0.16, 1, 0.3, 1] as [number, number, number, number],
};

export const springs = {
  gentle: { type: "spring", stiffness: 260, damping: 28, mass: 0.9 } as Transition,
  soft: { type: "spring", stiffness: 200, damping: 30 } as Transition,
  pop: { type: "spring", stiffness: 380, damping: 24 } as Transition,
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: ease.smooth } },
  exit: { opacity: 0, y: 4, transition: { duration: 0.15, ease: ease.smooth } },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.22, ease: ease.smooth } },
  exit: { opacity: 0, transition: { duration: 0.14 } },
};

export const slideInRight: Variants = {
  hidden: { opacity: 0, x: 32 },
  show: { opacity: 1, x: 0, transition: { duration: 0.34, ease: ease.smooth } },
  exit: { opacity: 0, x: 40, transition: { duration: 0.22, ease: ease.smooth } },
};

export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -32 },
  show: { opacity: 1, x: 0, transition: { duration: 0.32, ease: ease.smooth } },
  exit: { opacity: 0, x: -32, transition: { duration: 0.2, ease: ease.smooth } },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.22, ease: ease.smooth } },
  exit: { opacity: 0, scale: 0.97, transition: { duration: 0.14 } },
};

export const staggerChildren: Variants = {
  show: {
    transition: { staggerChildren: 0.04, delayChildren: 0.04 },
  },
};
