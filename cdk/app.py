#!/usr/bin/env python3
import os
from aws_cdk import (
    aws_ecr as ecr,
    aws_ecr_assets as ecr_assets,
    Stack,
)
import cdk_ecr_deployment as ecrdeploy
import aws_cdk as cdk
from constructs import Construct

class EcrRepositoryStack(cdk.Stack):
    def __init__(self, scope: Construct, id: str, **kwargs) -> None:
        super().__init__(scope, id, **kwargs)

        repository = ecr.Repository(self,
                       "ConsigSbcSipSidecarRepo",
                       repository_name="consig-sbc-sip-sidecar")

        image_asset = ecr_assets.DockerImageAsset(self, "sbcSipSidecar",
                                directory="../",
                                platform=ecr_assets.Platform.LINUX_AMD64,
                            )

        github_sha = os.getenv('GITHUB_SHA', 'local')
        github_branch = os.getenv('GITHUB_REF_NAME', 'local').replace('.', '_').replace('-', '_')

        ecrdeploy.ECRDeployment(self, f"DeployDockerImageSHA_{github_sha}",
                      src=ecrdeploy.DockerImageName(image_asset.image_uri),
                      dest=ecrdeploy.DockerImageName(f"{repository.repository_uri}:{github_sha}"))

        ecrdeploy.ECRDeployment(self, f"DeployDockerImageBranch_{github_branch}",
                      src=ecrdeploy.DockerImageName(image_asset.image_uri),
                      dest=ecrdeploy.DockerImageName(f"{repository.repository_uri}:{github_branch}"))

app = cdk.App()
EcrRepositoryStack(app, "sbcSipSidecar")
app.synth()
