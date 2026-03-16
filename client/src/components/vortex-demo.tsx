import React from "react";
import { Vortex } from "@/components/ui/vortex";

export default function VortexDemo() {
  return (
    <div className="mx-auto h-[30rem] w-[calc(100%-4rem)] overflow-hidden rounded-md">
      <Vortex
        backgroundColor="black"
        className="flex h-full w-full flex-col items-center justify-center px-2 py-4 md:px-10"
      >
        <h2 className="text-center text-2xl font-bold text-white md:text-6xl">
          The hell is this?
        </h2>
        <p className="mt-6 max-w-xl text-center text-sm text-white md:text-2xl">
          This is chemical burn. It&apos;ll hurt more than you&apos;ve ever been
          burned and you&apos;ll have a scar.
        </p>
        <div className="mt-6 flex flex-col items-center gap-4 sm:flex-row">
          <button className="rounded-lg bg-blue-600 px-4 py-2 text-white shadow-[0px_2px_0px_0px_#FFFFFF40_inset] transition duration-200 hover:bg-blue-700">
            Order now
          </button>
          <button className="px-4 py-2 text-white">Watch trailer</button>
        </div>
      </Vortex>
    </div>
  );
}
