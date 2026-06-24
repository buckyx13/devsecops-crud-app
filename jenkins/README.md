# Jenkins Setup Notes

This project assumes a Jenkins controller with the Docker Pipeline,
Amazon ECR, Pipeline: AWS Steps, and SSH Agent plugins installed, plus
Docker and the AWS CLI available on whichever agent runs the pipeline
(a Jenkins agent running inside the same VPC as the EKS cluster, or an
EC2-based agent, both work fine for this study setup).

Configure the following in Jenkins before running the pipeline.

An environment variable `AWS_ACCOUNT_ID` set globally (Manage Jenkins ->
System -> Global properties) so the Jenkinsfile can compute the ECR
registry URL without hardcoding the AWS account number into source control.

A credential of type "AWS Credentials" with ID `amazon-ecr`, scoped to an
IAM user or role whose policy is limited to ECR push/pull on the two
repositories used here (`crud-backend`, `crud-frontend`) rather than
broad ECR or account-wide access — this is the least-privilege principle
applied to CI credentials specifically.

A credential of type "SSH Username with private key" with ID
`git-deploy-key`, granting write access only to this repository, used
solely so the pipeline can commit the new image tag for ArgoCD to pick up.
This key should not have access to any other repository.

Once those are configured, point a Jenkins Pipeline job at this
repository with "Jenkinsfile" as the script path (`jenkins/Jenkinsfile`),
and trigger it either via a webhook on pushes to `main` or by chaining it
after the GitHub Actions workflow completes successfully (e.g. via a
generic webhook trigger plugin listening for the GitHub Actions
"workflow_run" event).
