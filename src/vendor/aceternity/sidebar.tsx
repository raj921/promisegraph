// Published source: https://ui.aceternity.com/registry/sidebar.json
// Catalog: https://21st.dev/@manuarora700/components/sidebar
"use client";
import { cn } from "@/lib/utils";
import React, { useState, useEffect, createContext, useContext } from "react";
import { motion } from "motion/react";
import { IconMenu2 } from "@tabler/icons-react";

import {Button} from "../shadcn/button";
import {Dialog,DialogContent,DialogTitle,DialogDescription} from "../shadcn/dialog";

interface Links {
  label: string;
  href: string;
  icon: React.JSX.Element | React.ReactNode;
}

interface SidebarContextProps {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  animate: boolean;
}

const SidebarContext = createContext<SidebarContextProps | undefined>(
  undefined
);

export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
};

export const SidebarProvider = ({
  children,
  open: openProp,
  setOpen: setOpenProp,
  animate = true,
}: {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  animate?: boolean;
}) => {
  const [openState, setOpenState] = useState(false);

  const open = openProp !== undefined ? openProp : openState;
  const setOpen = setOpenProp !== undefined ? setOpenProp : setOpenState;

  return (
    <SidebarContext.Provider value={{ open, setOpen, animate: animate }}>
      {children}
    </SidebarContext.Provider>
  );
};

export const Sidebar = ({
  children,
  open,
  setOpen,
  animate,
}: {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  animate?: boolean;
}) => {
  return (
    <SidebarProvider open={open} setOpen={setOpen} animate={animate}>
      {children}
    </SidebarProvider>
  );
};

export const SidebarBody = (props: React.ComponentProps<typeof motion.div>) => {
  return (
    <>
      <DesktopSidebar {...props} />
      <MobileSidebar {...(props as React.ComponentProps<"div">)} />
    </>
  );
};

export const DesktopSidebar = ({
  className,
  children,
  ...props
}: React.ComponentProps<typeof motion.div>) => {
  const { open, setOpen, animate } = useSidebar();
  return (
    <>
      <motion.div
        className={cn(
          "sidebar-desktop h-full px-4 py-4 hidden md:flex md:flex-col w-[300px] shrink-0",
          className
        )}
        animate={{
          width: animate ? (open ? "300px" : "60px") : "300px",
        }}
        onMouseEnter={animate ? () => setOpen(true) : undefined}
        onMouseLeave={animate ? () => setOpen(false) : undefined}
        {...props}
      >
        {children}
      </motion.div>
    </>
  );
};

// Integration: retain the published mobile sidebar layout with a focus-trapped shadcn dialog.
export const MobileSidebar = ({className,children}: React.ComponentProps<"div">) => {
  const {open,setOpen}=useSidebar();
  const [mobile,setMobile]=useState(false);
  useEffect(()=>{
    const media=window.matchMedia("(max-width: 767px)");
    const update=()=>{setMobile(media.matches);if(!media.matches)setOpen(false);};
    update();
    media.addEventListener("change",update);
    return ()=>media.removeEventListener("change",update);
  },[setOpen]);
  return <div className="sidebar-mobile-bar md:hidden"><span>promisegraph</span><Button variant="ghost" size="icon" aria-label="Open workspace navigation" onClick={()=>setOpen(true)}><IconMenu2/></Button><Dialog open={mobile&&open} onOpenChange={setOpen}><DialogContent className={cn("sidebar-mobile",className)}><DialogTitle className="sr-only">Workspace navigation</DialogTitle><DialogDescription className="sr-only">Choose a workspace page or manage connections.</DialogDescription>{children}</DialogContent></Dialog></div>;
};

export const SidebarLink = ({
  link,
  className,
  ...props
}: {
  link: Links;
  className?: string;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) => {
  const { open, animate } = useSidebar();
  return (
    <a
      href={link.href}
      className={cn(
        "flex items-center justify-start gap-2  group/sidebar py-2",
        className
      )}
      {...props}
    >
      {link.icon}

      <motion.span
        animate={{
          display: animate ? (open ? "inline-block" : "none") : "inline-block",
          opacity: animate ? (open ? 1 : 0) : 1,
        }}
        className="text-sm group-hover/sidebar:translate-x-1 transition duration-150 whitespace-pre inline-block !p-0 !m-0"
      >
        {link.label}
      </motion.span>
    </a>
  );
};
