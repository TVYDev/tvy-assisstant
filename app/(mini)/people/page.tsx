"use client";

import Link from "next/link";
import { OwnerGuard } from "@/components/mini/owner-guard";
import { Money } from "@/components/mini/money";
import { ErrorBanner, LoadingBlock, PageHeader } from "@/components/mini/ui";
import { useMiniGet } from "@/components/mini/use-mini-get";
import type { getPeoplePayload } from "@/lib/mini-app/queries";

type PeoplePayload = Awaited<ReturnType<typeof getPeoplePayload>>;

export default function PeoplePage() {
  const { data, error, loading } = useMiniGet<PeoplePayload>(
    "/api/mini/owner/people",
  );

  return (
    <OwnerGuard>
      <PageHeader title="People" subtitle="Open a shortcode to manage the ledger" />
      {error ? <ErrorBanner message={error} /> : null}
      {loading || !data ? (
        <LoadingBlock />
      ) : (
        <ul className="list bg-base-100 rounded-box border border-base-300">
          {data.people.map((person) => {
            const code = person.shortcode ?? "—";
            const name = [person.first_name, person.last_name]
              .filter(Boolean)
              .join(" ");
            return (
              <li key={`${code}-${person.telegram_user_id}`} className="list-row">
                {person.shortcode ? (
                  <Link
                    href={`/people/${person.shortcode}`}
                    className="flex flex-1 justify-between gap-3"
                  >
                    <span>
                      <span className="font-semibold">{code}</span>
                      <span className="block text-xs opacity-70">
                        {name || "No name"}
                        {person.telegram_username
                          ? ` · @${person.telegram_username}`
                          : ""}
                      </span>
                    </span>
                    <Money
                      amount={person.ledger?.netTotal ?? 0}
                      className="font-semibold"
                    />
                  </Link>
                ) : (
                  <span className="flex flex-1 justify-between">
                    <span>{name || "Unlinked user"}</span>
                    <span className="opacity-50">no shortcode</span>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </OwnerGuard>
  );
}
