// City-level forecast; no customer location or identifying data leaves our server.
export const revalidate = 3600;
export async function GET() {
  try {
    const r = await fetch(
      "https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=-34.6514&lon=-59.4307",
      {
        headers: {
          "User-Agent":
            "GoldGymMercedes/1.0 https://gold-gym-mercedes.vercel.app/",
        },
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(6000),
      },
    );
    if (!r.ok) throw Error("weather");
    type Point = {
      time: string;
      data: {
        instant: { details: { air_temperature?: number } };
        next_1_hours?: { details: { precipitation_amount?: number } };
        next_6_hours?: { details: { precipitation_amount?: number } };
      };
    };
    const j = (await r.json()) as {
      properties: { meta: { updated_at: string }; timeseries: Point[] };
    };
    const periods = (j.properties?.timeseries ?? []).flatMap(
      (v: {
        time: string;
        data: {
          instant: { details: { air_temperature?: number } };
          next_1_hours?: { details: { precipitation_amount?: number } };
          next_6_hours?: { details: { precipitation_amount?: number } };
        };
      }) => {
        const interval = v.data.next_1_hours ?? v.data.next_6_hours,
          hours = v.data.next_1_hours ? 1 : 6;
        if (
          !interval ||
          !Number.isFinite(interval.details.precipitation_amount)
        )
          return [];
        return [
          {
            time: v.time,
            hours,
            rain: interval.details.precipitation_amount,
            temperature: v.data.instant.details.air_temperature,
          },
        ];
      },
    );
    return Response.json(
      { updatedAt: j.properties.meta.updated_at, periods },
      { headers: { "Cache-Control": "public, max-age=900, s-maxage=3600" } },
    );
  } catch {
    return Response.json(
      { periods: [], unavailable: true },
      { headers: { "Cache-Control": "public, max-age=60" } },
    );
  }
}
