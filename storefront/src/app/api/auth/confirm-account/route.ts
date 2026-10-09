import { readAuthJsonObject } from "@/lib/auth/request-body";
import { NextRequest, NextResponse } from "next/server";
import { httpStatusForAuthErrors } from "@/lib/auth/auth-api-utils";
import { rejectIfRateLimited } from "@/lib/auth/auth-rate-limit";
import { confirmAccountWithToken } from "@/lib/auth/confirm-account";

export async function POST(request: NextRequest) {
	const rateLimited = rejectIfRateLimited(request, "confirm-account", {
		limit: 10,
		windowMs: 15 * 60 * 1000,
	});
	if (rateLimited) {
		return rateLimited;
	}

	const body = await readAuthJsonObject(request);
	if (!body) {
		return NextResponse.json(
			{ errors: [{ message: "Invalid request body", code: "INVALID_JSON" }] },
			{ status: 400 },
		);
	}

	const { email, token, password } = body;

	if (typeof email !== "string" || !email.trim() || typeof token !== "string" || !token || typeof password !== "string" || !password) {
		return NextResponse.json(
			{ errors: [{ message: "Email, token, and password are required", code: "REQUIRED" }] },
			{ status: 400 },
		);
	}

	const result = await confirmAccountWithToken(email, token, password);

	if (!result.ok) {
		return NextResponse.json({ errors: result.errors }, { status: httpStatusForAuthErrors(result.errors) });
	}

	return NextResponse.json({
		success: true,
		message: "Account confirmed successfully",
	});
}
