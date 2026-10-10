import { sharedCustomerAccountsEnabled, customerAccountUnavailableResponse } from "@/lib/brand/customer-account-policy";
import { readAuthJsonObject } from "@/lib/auth/request-body";
import { NextRequest, NextResponse } from "next/server";
import { httpStatusForAuthErrors } from "@/lib/auth/auth-api-utils";
import { rejectIfRateLimited } from "@/lib/auth/auth-rate-limit";
import { resetPasswordWithToken } from "@/lib/auth/bff-server";

export async function POST(request: NextRequest) {
	if (!sharedCustomerAccountsEnabled(process.env.STOREFRONT_SITES_JSON)) {
		return customerAccountUnavailableResponse();
	}

	const rateLimited = rejectIfRateLimited(request, "set-password");
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

	if (password.length < 8) {
		return NextResponse.json(
			{ errors: [{ message: "Password must be at least 8 characters", code: "PASSWORD_TOO_SHORT" }] },
			{ status: 400 },
		);
	}

	const result = await resetPasswordWithToken(email, token, password);

	if (!result.ok) {
		return NextResponse.json({ errors: result.errors }, { status: httpStatusForAuthErrors(result.errors) });
	}

	return NextResponse.json({
		success: true,
		message: "Password updated successfully",
	});
}
